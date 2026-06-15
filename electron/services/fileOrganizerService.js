'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Downloads file organizer service.
 *
 * Safety rules (hard requirements):
 *  - Never deletes a file.
 *  - Never moves anything during a scan (preview only).
 *  - Files are only moved after the user explicitly confirms.
 *  - On name collision, appends an incrementing suffix, e.g. file(1).pdf.
 */

const CATEGORY_RULES = [
  { category: 'PDF', exts: ['.pdf'] },
  { category: 'Documents', exts: ['.doc', '.docx', '.txt', '.md', '.rtf', '.odt'] },
  { category: 'Presentations', exts: ['.ppt', '.pptx'] },
  { category: 'Images', exts: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'] },
  { category: 'Compressed', exts: ['.zip', '.rar', '.7z', '.tar', '.gz'] },
  { category: 'Code', exts: ['.cpp', '.c', '.h', '.hpp', '.js', '.jsx', '.ts', '.tsx', '.v', '.py', '.java', '.cs', '.go', '.rs'] },
];

const OTHERS_CATEGORY = 'Others';
// Folders we created ourselves – skip them so we don't re-organise category folders.
const CATEGORY_FOLDER_NAMES = new Set([
  ...CATEGORY_RULES.map((r) => r.category),
  OTHERS_CATEGORY,
]);

function getDownloadsPath(override) {
  if (override && override.trim()) return override;
  return path.join(os.homedir(), 'Downloads');
}

function categoryForExt(ext) {
  const lower = ext.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.exts.includes(lower)) return rule.category;
  }
  return OTHERS_CATEGORY;
}

/**
 * Resolve a non-colliding destination path. If `dir/name.ext` exists,
 * returns `dir/name(1).ext`, `dir/name(2).ext`, ...
 */
function resolveCollision(destDir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(destDir, fileName);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(destDir, `${base}(${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

/**
 * Scan the Downloads root (non-recursive) and produce a move preview.
 * Returns { ok, downloadsPath, items: [...], totalFiles, byCategory }.
 */
function scan(override) {
  const downloadsPath = getDownloadsPath(override);
  const result = {
    ok: true,
    downloadsPath,
    items: [],
    totalFiles: 0,
    byCategory: {},
  };

  let entries;
  try {
    entries = fs.readdirSync(downloadsPath, { withFileTypes: true });
  } catch (err) {
    return {
      ...result,
      ok: false,
      error: `無法讀取 Downloads 資料夾（${downloadsPath}）：${err.message}`,
    };
  }

  for (const entry of entries) {
    try {
      if (!entry.isFile()) continue; // skip directories / symlinks
      const ext = path.extname(entry.name);
      const category = categoryForExt(ext);
      const sourcePath = path.join(downloadsPath, entry.name);
      const targetDir = path.join(downloadsPath, category);
      result.items.push({
        name: entry.name,
        ext: ext || '(無副檔名)',
        category,
        sourcePath,
        targetDir,
      });
      result.totalFiles += 1;
      result.byCategory[category] = (result.byCategory[category] || 0) + 1;
    } catch (err) {
      // Skip unreadable entries but keep going.
      console.error('[fileOrganizerService] scan entry failed:', entry.name, err);
    }
  }

  return result;
}

/**
 * Lightweight count of loose (unsorted) files directly in the Downloads root.
 * Used by the dashboard.
 */
function countUnsorted(override) {
  const downloadsPath = getDownloadsPath(override);
  try {
    const entries = fs.readdirSync(downloadsPath, { withFileTypes: true });
    return {
      ok: true,
      downloadsPath,
      count: entries.filter((e) => e.isFile()).length,
    };
  } catch (err) {
    return { ok: false, downloadsPath, count: 0, error: err.message };
  }
}

/**
 * Move the provided items into their category folders.
 * `items` should come from scan().items (or a filtered subset).
 * Returns per-file results; never throws for individual failures.
 */
function organize(items) {
  const results = [];
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: true, moved: 0, failed: 0, results: [] };
  }

  let moved = 0;
  let failed = 0;

  for (const item of items) {
    try {
      if (!item || !item.sourcePath || !item.targetDir) {
        throw new Error('項目資料不完整');
      }
      if (!fs.existsSync(item.sourcePath)) {
        throw new Error('來源檔案已不存在');
      }
      fs.mkdirSync(item.targetDir, { recursive: true });
      const dest = resolveCollision(item.targetDir, path.basename(item.sourcePath));

      try {
        fs.renameSync(item.sourcePath, dest);
      } catch (err) {
        // Cross-device move: fall back to copy + unlink (still never destructive on error).
        if (err.code === 'EXDEV') {
          fs.copyFileSync(item.sourcePath, dest);
          fs.unlinkSync(item.sourcePath);
        } else {
          throw err;
        }
      }

      moved += 1;
      results.push({
        name: item.name,
        from: item.sourcePath,
        to: dest,
        category: item.category,
        status: 'moved',
      });
    } catch (err) {
      failed += 1;
      results.push({
        name: item ? item.name : '(未知)',
        from: item ? item.sourcePath : '',
        to: '',
        category: item ? item.category : '',
        status: 'error',
        error: err.message,
      });
    }
  }

  return { ok: failed === 0, moved, failed, results };
}

module.exports = {
  CATEGORY_RULES,
  OTHERS_CATEGORY,
  getDownloadsPath,
  categoryForExt,
  scan,
  countUnsorted,
  organize,
};
