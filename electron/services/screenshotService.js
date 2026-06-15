'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Screenshot Organizer service.
 *
 * Scans a screenshots folder for png/jpg/jpeg and categorises each file into
 * Code / Circuit / Report / School / Other based on keyword matching against the
 * filename. Preview only — moving is done by fileOrganizerService.organize after
 * the user confirms (same safety rules: never delete, auto-number on collision).
 */

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg'];

const CATEGORIES = ['Code', 'Circuit', 'Report', 'School', 'Other'];

// Default keyword map. Editable via config.screenshots.keywords.
const DEFAULT_KEYWORDS = {
  Code: ['code', 'vscode', 'terminal', 'bug', 'error', 'leetcode', 'program', 'compile', '程式', '報錯'],
  Circuit: ['circuit', 'pcb', 'schematic', 'spice', 'ltspice', 'multisim', 'proteus', 'waveform', '電路', '波形'],
  Report: ['report', 'paper', 'thesis', 'doc', '報告', '論文'],
  School: ['hw', 'homework', 'lecture', 'class', 'exam', 'quiz', 'course', '作業', '上課', '課程', '考試'],
};

function getScreenshotsPath(config) {
  const general = (config && config.general) || {};
  const screenshots = (config && config.screenshots) || {};
  const override = screenshots.path || general.screenshotsPath;
  if (override && override.trim()) return override;
  // Sensible default: Windows uses Pictures\Screenshots.
  return path.join(os.homedir(), 'Pictures', 'Screenshots');
}

function getKeywordMap(config) {
  const fromConfig = config && config.screenshots && config.screenshots.keywords;
  if (fromConfig && typeof fromConfig === 'object') {
    return { ...DEFAULT_KEYWORDS, ...fromConfig };
  }
  return DEFAULT_KEYWORDS;
}

function categorize(fileName, keywordMap) {
  const lower = fileName.toLowerCase();
  for (const category of ['Code', 'Circuit', 'Report', 'School']) {
    const words = keywordMap[category] || [];
    if (words.some((w) => w && lower.includes(String(w).toLowerCase()))) {
      return category;
    }
  }
  return 'Other';
}

function scan(config) {
  const screenshotsPath = getScreenshotsPath(config);
  const keywordMap = getKeywordMap(config);
  const result = {
    ok: true,
    screenshotsPath,
    items: [],
    totalFiles: 0,
    byCategory: {},
    categories: CATEGORIES,
  };

  // Skip our own category folders so re-scanning doesn't re-move sorted files.
  const skip = new Set(CATEGORIES.map((c) => c.toLowerCase()));

  let entries;
  try {
    entries = fs.readdirSync(screenshotsPath, { withFileTypes: true });
  } catch (err) {
    return {
      ...result,
      ok: false,
      error: `無法讀取截圖資料夾（${screenshotsPath}）：${err.message}`,
    };
  }

  for (const entry of entries) {
    try {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTS.includes(ext)) continue;
      const category = categorize(entry.name, keywordMap);
      const sourcePath = path.join(screenshotsPath, entry.name);
      const targetDir = path.join(screenshotsPath, category);
      result.items.push({ name: entry.name, ext, category, sourcePath, targetDir });
      result.totalFiles += 1;
      result.byCategory[category] = (result.byCategory[category] || 0) + 1;
    } catch (err) {
      console.error('[screenshotService] scan entry failed:', entry.name, err);
    }
  }

  return result;
}

module.exports = {
  CATEGORIES,
  DEFAULT_KEYWORDS,
  getScreenshotsPath,
  categorize,
  scan,
};
