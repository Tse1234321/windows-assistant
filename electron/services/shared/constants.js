'use strict';

/**
 * Shared constants — single source of truth for values that were previously
 * duplicated across services (settingsService, projectService, cleanupService).
 *
 * Keeping one canonical list avoids the lists drifting apart over time (the old
 * settingsService copy was a stale 14-entry subset of projectService's 20).
 */

/**
 * Folders that should never be treated as user projects or descended into when
 * scanning project roots. Mix of absolute Windows system paths and folder names
 * matched anywhere in a path (build artifacts, dependency caches, VCS metadata).
 */
const PROJECT_EXCLUDES = Object.freeze([
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'AppData',
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.cache',
  '.vscode',
  'venv',
  '.venv',
  'release',
  'release-auto',
  'target',
  '__pycache__',
]);

module.exports = {
  PROJECT_EXCLUDES,
};
