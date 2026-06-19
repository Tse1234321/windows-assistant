'use strict';

const fileOrganizerService = require('./fileOrganizerService');

function buildStats(scanResult) {
  return (scanResult.categories || []).map((item) => ({
    category: item.category,
    count: item.count,
  }));
}

async function undo() {
  return fileOrganizerService.restoreLast();
}

module.exports = {
  CATEGORY_RULES: fileOrganizerService.CATEGORY_RULES,
  scan: fileOrganizerService.scan,
  organize: fileOrganizerService.organize,
  countUnsorted: fileOrganizerService.countUnsorted,
  categoryForExt: fileOrganizerService.categoryForExt,
  detectDownloads: fileOrganizerService.detectDownloads,
  resolveDownloadsPath: fileOrganizerService.resolveDownloadsPath,
  buildStats,
  undo,
};
