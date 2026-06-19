'use strict';

let electronApp = null;
try {
  const electron = require('electron');
  electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
  // Keep service importable outside Electron.
}

/**
 * Auto-launch (start at login) service.
 * Only registers for the packaged app on Windows so we never add the dev
 * Electron binary to the user's startup.
 */

function isSupported() {
  return process.platform === 'win32' && !!(electronApp && electronApp.isPackaged);
}

function apply(enabled) {
  if (!isSupported()) return { supported: false };
  try {
    electronApp.setLoginItemSettings({
      openAtLogin: !!enabled,
      enabled: !!enabled,
      path: process.execPath,
      args: [],
    });
    return { supported: true };
  } catch (err) {
    return { supported: true, error: err.message };
  }
}

function getOpenAtLogin() {
  try {
    return isSupported() ? electronApp.getLoginItemSettings().openAtLogin : null;
  } catch (_) {
    return null;
  }
}

module.exports = { isSupported, apply, getOpenAtLogin };
