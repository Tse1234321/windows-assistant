'use strict';

const projectService = require('./projectService');
const modeService = require('./modeService');

/**
 * Command Palette action registry.
 *
 * The single source of truth for "things the user can do" via Ctrl+Shift+P.
 * Commands are built from static navigation actions plus dynamic, per-project
 * actions derived from the config. Each command has an `action` descriptor that
 * tells the renderer (navigate) or the main process (run) how to execute it.
 */

const STATIC_COMMANDS = [
  { id: 'nav.dashboard', title: '開啟 Dashboard', hint: '首頁狀態總覽', keywords: 'dashboard home 首頁 總覽', action: { kind: 'navigate', page: 'dashboard' } },
  { id: 'nav.files', title: '整理 Downloads', hint: '掃描並分類下載資料夾', keywords: 'downloads files 整理 下載 檔案', action: { kind: 'navigate', page: 'files' } },
  { id: 'nav.health', title: '檢查 Git / 健康監控', hint: 'CPU / RAM / Disk / Git', keywords: 'git health cpu ram disk 健康 監控', action: { kind: 'navigate', page: 'health' } },
  { id: 'nav.projects', title: '開啟 Project Hub', hint: '專案管理中心', keywords: 'projects hub 專案', action: { kind: 'navigate', page: 'projects' } },
  { id: 'nav.rules', title: '開啟 Smart Rules', hint: '規則提醒設定', keywords: 'rules 規則 提醒', action: { kind: 'navigate', page: 'rules' } },
  { id: 'nav.screenshots', title: '開啟 Screenshot Organizer', hint: '截圖整理', keywords: 'screenshots 截圖', action: { kind: 'navigate', page: 'screenshots' } },
  { id: 'nav.settings', title: '開啟設定', hint: '編輯 user-settings.json', keywords: 'settings config 設定', action: { kind: 'navigate', page: 'settings' } },
];

function listCommands(config) {
  const commands = [...STATIC_COMMANDS];

  const projects = (config && Array.isArray(config.projects)) ? config.projects : [];
  for (const p of projects) {
    if (!p || !p.name) continue;
    commands.push({
      id: `project.open.${p.name}`,
      title: `用 VS Code 開啟：${p.name}`,
      hint: p.path || '',
      keywords: `project vscode 專案 ${p.name}`,
      action: { kind: 'project', projectName: p.name, projectAction: 'openVSCode' },
    });
    commands.push({
      id: `project.dev.${p.name}`,
      title: `執行 npm run dev：${p.name}`,
      hint: p.path || '',
      keywords: `project npm dev run 專案 ${p.name}`,
      action: { kind: 'project', projectName: p.name, projectAction: 'runDev' },
    });
    commands.push({
      id: `project.folder.${p.name}`,
      title: `開啟資料夾：${p.name}`,
      hint: p.path || '',
      keywords: `project folder 資料夾 ${p.name}`,
      action: { kind: 'project', projectName: p.name, projectAction: 'openFolder' },
    });
  }

  const modes = modeService.listModes(config);
  for (const m of modes) {
    commands.push({
      id: `mode.run.${m.name}`,
      title: `啟動工作模式：${m.name}`,
      hint: `${m.apps.length} apps · ${m.urls.length} urls`,
      keywords: `mode 模式 ${m.name}`,
      action: { kind: 'mode', modeName: m.name },
    });
  }

  return commands;
}

/**
 * Execute a command by id. Navigation commands return a `{ navigate }` directive
 * for the renderer; backend commands run here and return an `{ ok, message }` result.
 */
async function runCommand(config, commandId) {
  const command = listCommands(config).find((c) => c.id === commandId);
  if (!command) return { ok: false, error: '找不到指令' };

  const { action } = command;
  if (action.kind === 'navigate') {
    return { ok: true, navigate: action.page };
  }
  if (action.kind === 'project') {
    const res = await projectService.runAction(config, {
      projectName: action.projectName,
      action: action.projectAction,
    });
    return { ...res, navigate: action.projectAction === 'openFolder' ? null : 'projects' };
  }
  if (action.kind === 'mode') {
    const res = await modeService.runMode(config, action.modeName);
    return { ok: res.ok, message: `已啟動模式：${res.mode}`, navigate: 'modes' };
  }
  return { ok: false, error: '未知的指令類型' };
}

module.exports = {
  listCommands,
  runCommand,
};
