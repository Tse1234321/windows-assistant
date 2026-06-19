'use strict';

const {
  DOCUMENT_EXTS,
  DOCUMENT_SUB_RULES,
  getDocumentSubRule,
  isDocumentSubcategoryFolderName,
  normalizeExt,
} = require('./organizerRules');

function isDocumentExt(ext) {
  return DOCUMENT_EXTS.has(normalizeExt(ext));
}

function documentSubcategoryForExt(ext) {
  const lower = normalizeExt(ext);
  for (const rule of DOCUMENT_SUB_RULES) {
    if (rule.exts.includes(lower)) return rule.category;
  }
  return 'Others';
}

module.exports = {
  DOCUMENT_SUB_RULES,
  getDocumentSubRule,
  isDocumentExt,
  isDocumentSubcategoryFolderName,
  documentSubcategoryForExt,
};
