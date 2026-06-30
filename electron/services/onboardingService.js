'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CORE_TEMP_WINGET_ID = 'ALCPU.CoreTemp';
const CORE_TEMP_URL = 'https://www.alcpu.com/CoreTemp/';
const VIRUSTOTAL_JOIN_URL = 'https://www.virustotal.com/gui/join-us';
const VIRUSTOTAL_API_KEY_URL = 'https://www.virustotal.com/gui/my-apikey';

function fileExists(target) {
  try {
    return !!(target && fs.existsSync(target));
  } catch (_) {
    return false;
  }
}

function findCoreTempExe() {
  if (process.platform !== 'win32') return '';
  const candidates = [
    'C:\\Program Files\\Core Temp\\Core Temp.exe',
    'C:\\Program Files (x86)\\Core Temp\\Core Temp.exe',
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'Core Temp', 'Core Temp.exe')
      : '',
    process.env['ProgramFiles(x86)']
      ? path.join(process.env['ProgramFiles(x86)'], 'Core Temp', 'Core Temp.exe')
      : '',
  ].filter(Boolean);
  return candidates.find(fileExists) || '';
}

function execCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: options.timeout || 15000,
        windowsHide: options.windowsHide !== false,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err && typeof err.code !== 'undefined' ? err.code : 0,
          error: err ? stderr || err.message : '',
          stdout: stdout || '',
          stderr: stderr || '',
        });
      },
    );
  });
}

async function getWingetStatus() {
  if (process.platform !== 'win32') {
    return { ok: false, available: false, error: 'Winget is only available on Windows.' };
  }
  const result = await execCommand('winget', ['--version'], { timeout: 10000 });
  return {
    ok: result.ok,
    available: result.ok,
    version: result.ok ? result.stdout.trim() : '',
    error: result.ok ? '' : result.error || 'Winget is not available on this device.',
  };
}

async function getCoreTempStatus() {
  const exePath = findCoreTempExe();
  const winget = await getWingetStatus();
  return {
    ok: true,
    installed: !!exePath,
    path: exePath,
    wingetAvailable: winget.available === true,
    wingetVersion: winget.version || '',
    installId: CORE_TEMP_WINGET_ID,
    downloadUrl: CORE_TEMP_URL,
  };
}

async function installCoreTemp() {
  const before = await getCoreTempStatus();
  if (before.installed) return { ok: true, alreadyInstalled: true, coreTemp: before };
  if (!before.wingetAvailable) {
    return {
      ok: false,
      needsManualInstall: true,
      error: 'Winget is not available. Open the official Core Temp download page instead.',
      downloadUrl: CORE_TEMP_URL,
    };
  }

  const result = await execCommand(
    'winget',
    [
      'install',
      '-e',
      '--id',
      CORE_TEMP_WINGET_ID,
      '--accept-source-agreements',
      '--accept-package-agreements',
    ],
    { timeout: 10 * 60 * 1000, windowsHide: false },
  );
  const after = await getCoreTempStatus();
  return {
    ok: result.ok && after.installed,
    installed: after.installed,
    coreTemp: after,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.ok
      ? after.installed
        ? ''
        : 'Core Temp installer finished, but the app was not found in the default install path.'
      : result.error || 'Core Temp installation failed.',
    downloadUrl: CORE_TEMP_URL,
  };
}

module.exports = {
  CORE_TEMP_URL,
  VIRUSTOTAL_JOIN_URL,
  VIRUSTOTAL_API_KEY_URL,
  getCoreTempStatus,
  installCoreTemp,
};
