'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { shell } = require('electron');

const gitService = require('./gitService');

/**
 * Project Hub service.
 *
 * Enriches configured projects with git status (via gitService) and provides
 * per-project actions (open folder / VS Code / terminal / npm run dev / git status).
 * Every action is path-checked first and returns a friendly result instead of throwing.
 */

function findProject(config, name) {
  const projects = (config && Array.isArray(config.projects)) ? config.projects : [];
  return projects.find((p) => p.name === name) || null;
}

async function listProjects(config) {
  const projects = (config && Array.isArray(config.projects)) ? config.projects : [];
  const result = [];
  for (const p of projects) {
    // Reuse the read-only git check so the Project Hub and Health page agree.
    // eslint-disable-next-line no-await-in-loop
    result.push(await gitService.checkProject(p));
  }
  return { ok: true, projects: result };
}

function pathExists(target) {
  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory();
  } catch (_) {
    return false;
  }
}

async function openFolder(target) {
  if (!pathExists(target)) return { ok: false, error: `找不到資料夾：${target}` };
  const err = await shell.openPath(target);
  return err ? { ok: false, error: err } : { ok: true, message: '已開啟資料夾' };
}

function spawnDetached(command, args, cwd) {
  const isWin = process.platform === 'win32';
  const child = spawn(command, args, {
    cwd,
    shell: true,
    detached: !isWin,
    stdio: 'ignore',
    windowsHide: false,
  });
  if (!isWin) {
    try {
      child.unref();
    } catch (_) {
      /* noop */
    }
  }
  return child;
}

function openInVSCode(target) {
  if (!pathExists(target)) return { ok: false, error: `找不到資料夾：${target}` };
  return new Promise((resolve) => {
    try {
      // `code` is the VS Code CLI (added to PATH by the installer).
      const child = spawnDetached('code', ['.'], target);
      child.on('error', (e) =>
        resolve({ ok: false, error: `無法啟動 VS Code（請確認 'code' 已加入 PATH）：${e.message}` })
      );
      setTimeout(() => resolve({ ok: true, message: '已用 VS Code 開啟' }), 400);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function openTerminal(target) {
  if (!pathExists(target)) return { ok: false, error: `找不到資料夾：${target}` };
  return new Promise((resolve) => {
    try {
      const platform = process.platform;
      let child;
      if (platform === 'win32') {
        // Open a new cmd window at the project directory.
        child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${target}"`], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
      } else if (platform === 'darwin') {
        child = spawn('open', ['-a', 'Terminal', target], { detached: true, stdio: 'ignore' });
      } else {
        // Best-effort on Linux; many distros provide x-terminal-emulator.
        child = spawn('x-terminal-emulator', [], { cwd: target, detached: true, stdio: 'ignore' });
      }
      child.on('error', (e) => resolve({ ok: false, error: `無法開啟終端機：${e.message}` }));
      try {
        child.unref();
      } catch (_) {
        /* noop */
      }
      setTimeout(() => resolve({ ok: true, message: '已開啟終端機' }), 400);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function runNpmDev(target) {
  if (!pathExists(target)) return { ok: false, error: `找不到資料夾：${target}` };
  if (!fs.existsSync(`${target}/package.json`)) {
    return { ok: false, error: '此資料夾沒有 package.json' };
  }
  return new Promise((resolve) => {
    try {
      const child = spawnDetached('npm run dev', [], target);
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
      setTimeout(() => resolve({ ok: true, message: '已啟動 npm run dev' }), 600);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function gitStatus(config, name) {
  const project = findProject(config, name);
  if (!project) return { ok: false, error: '找不到專案設定' };
  const status = await gitService.checkProject(project);
  return { ok: true, status };
}

async function runAction(config, payload) {
  const { projectName, action } = payload || {};
  const project = findProject(config, projectName);
  if (!project) return { ok: false, error: '找不到專案設定' };
  const target = project.path;

  switch (action) {
    case 'openFolder':
      return openFolder(target);
    case 'openVSCode':
      return openInVSCode(target);
    case 'openTerminal':
      return openTerminal(target);
    case 'runDev':
      return runNpmDev(target);
    case 'gitStatus':
      return gitStatus(config, projectName);
    default:
      return { ok: false, error: `未知的動作：${action}` };
  }
}

module.exports = {
  findProject,
  listProjects,
  runAction,
};
