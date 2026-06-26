'use strict';

/**
 * Hermetic stub for the `electron` module used during unit tests.
 *
 * Services such as settingsService / projectService `require('electron')` to
 * reach `app` and `shell`. In a plain Node/Vitest context the real package
 * tries to resolve (and sometimes download) the Electron binary, which is slow
 * and network-dependent. This stub stands in for it: `app` is absent (so code
 * falls back to OS paths) and `shell` is a no-op.
 */
module.exports = {
  app: null,
  shell: {
    openPath: async () => '',
    showItemInFolder: () => {},
  },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: class {},
};
