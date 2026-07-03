'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');

const TASK_NAME = 'PC Life Assistant Elevated';
const DEFAULT_SHORTCUT_NAME = 'PC Life Assistant.lnk';
const SHORTCUT_NAME = 'PC Life Assistant (Admin).lnk';

function execFileCapture(file, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 45000, windowsHide: true, ...options }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        exitCode: typeof err?.code === 'number' ? err.code : 0,
        error: err ? stderr || err.message : '',
        stdout: stdout || '',
        stderr: stderr || '',
      });
    });
  });
}

async function execPowerShell(script, timeout = 45000) {
  return execFileCapture(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout },
  );
}

async function readJsonObject(target) {
  try {
    const text = (await fs.promises.readFile(target, 'utf-8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function psSingleQuote(value) {
  return String(value || '').replace(/'/g, "''");
}

function currentExePath() {
  try {
    return app.getPath('exe');
  } catch (_) {
    return process.execPath;
  }
}

function shortcutPaths() {
  const desktopDir = path.join(os.homedir(), 'Desktop');
  const startMenuDir = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
  );
  return {
    desktop: path.join(desktopDir, DEFAULT_SHORTCUT_NAME),
    startMenu: path.join(startMenuDir, DEFAULT_SHORTCUT_NAME),
    adminDesktop: path.join(desktopDir, SHORTCUT_NAME),
    adminStartMenu: path.join(startMenuDir, SHORTCUT_NAME),
  };
}

async function runElevatedJson(innerScript) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scriptPath = path.join(os.tmpdir(), `pla-admin-launch-${id}.ps1`);
  const resultPath = path.join(os.tmpdir(), `pla-admin-launch-${id}.json`);
  const script = `
    $ErrorActionPreference = "Stop"
    try {
      $result = & {
${innerScript}
      }
      @{ ok = $true; result = $result } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath '${psSingleQuote(resultPath)}' -Encoding UTF8
    } catch {
      @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath '${psSingleQuote(resultPath)}' -Encoding UTF8
    }
  `;
  await fs.promises.writeFile(scriptPath, script, 'utf-8');
  const launcher = `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${psSingleQuote(scriptPath)}')`;
  const launched = await execPowerShell(launcher, 300000);
  if (!launched.ok) return { ok: false, error: launched.error };
  const parsed = await readJsonObject(resultPath);
  fs.promises.rm(scriptPath, { force: true }).catch(() => {});
  fs.promises.rm(resultPath, { force: true }).catch(() => {});
  return parsed.ok ? { ok: true, result: parsed.result } : { ok: false, error: parsed.error || 'Elevated action failed.' };
}

async function isCurrentProcessElevated() {
  const script = `
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    [PSCustomObject]@{
      User = $identity.Name
      IsElevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } | ConvertTo-Json -Compress
  `;
  const result = await execPowerShell(script, 10000);
  if (!result.ok) return { user: '', isElevated: false };
  try {
    const parsed = JSON.parse(result.stdout);
    return { user: parsed.User || '', isElevated: parsed.IsElevated === true };
  } catch (_) {
    return { user: '', isElevated: false };
  }
}

async function taskExists() {
  const result = await execFileCapture('schtasks.exe', ['/Query', '/TN', TASK_NAME], { timeout: 10000 });
  return result.ok;
}

async function getStatus() {
  const elevated = await isCurrentProcessElevated();
  const shortcuts = shortcutPaths();
  const enabled = await taskExists();
  return {
    ok: true,
    enabled,
    isElevated: elevated.isElevated,
    user: elevated.user,
    taskName: TASK_NAME,
    exePath: currentExePath(),
    shortcutPaths: shortcuts,
    shortcuts: {
      desktop: fs.existsSync(shortcuts.desktop),
      startMenu: fs.existsSync(shortcuts.startMenu),
      adminDesktop: fs.existsSync(shortcuts.adminDesktop),
      adminStartMenu: fs.existsSync(shortcuts.adminStartMenu),
    },
  };
}

async function enable() {
  const exePath = currentExePath();
  const shortcuts = shortcutPaths();
  const script = `
        $taskName = '${psSingleQuote(TASK_NAME)}'
        $exePath = '${psSingleQuote(exePath)}'
        $desktopShortcut = '${psSingleQuote(shortcuts.desktop)}'
        $startMenuShortcut = '${psSingleQuote(shortcuts.startMenu)}'
        $adminDesktopShortcut = '${psSingleQuote(shortcuts.adminDesktop)}'
        $adminStartMenuShortcut = '${psSingleQuote(shortcuts.adminStartMenu)}'
        $userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $action = New-ScheduledTaskAction -Execute $exePath
        $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null

        $shell = New-Object -ComObject WScript.Shell
        foreach ($shortcutPath in @($desktopShortcut, $startMenuShortcut, $adminDesktopShortcut, $adminStartMenuShortcut)) {
          New-Item -ItemType Directory -Force -Path (Split-Path -Parent $shortcutPath) | Out-Null
          $shortcut = $shell.CreateShortcut($shortcutPath)
          $shortcut.TargetPath = "$env:SystemRoot\\System32\\schtasks.exe"
          $shortcut.Arguments = "/run /tn \`"$taskName\`""
          $shortcut.WorkingDirectory = Split-Path -Parent $exePath
          $shortcut.IconLocation = "$exePath,0"
          $shortcut.Description = "Launch PC Life Assistant with administrator privileges"
          $shortcut.Save()
        }

        [PSCustomObject]@{
          TaskName = $taskName
          ExePath = $exePath
          DesktopShortcut = $desktopShortcut
          StartMenuShortcut = $startMenuShortcut
          AdminDesktopShortcut = $adminDesktopShortcut
          AdminStartMenuShortcut = $adminStartMenuShortcut
        }
      `;
  const result = await runElevatedJson(script);
  if (!result.ok) return result;
  return { ...(await getStatus()), created: result.result };
}

async function disable() {
  const shortcuts = shortcutPaths();
  const exePath = currentExePath();
  const script = `
        $taskName = '${psSingleQuote(TASK_NAME)}'
        $exePath = '${psSingleQuote(exePath)}'
        $desktopShortcut = '${psSingleQuote(shortcuts.desktop)}'
        $startMenuShortcut = '${psSingleQuote(shortcuts.startMenu)}'
        $adminDesktopShortcut = '${psSingleQuote(shortcuts.adminDesktop)}'
        $adminStartMenuShortcut = '${psSingleQuote(shortcuts.adminStartMenu)}'
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $adminDesktopShortcut -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $adminStartMenuShortcut -Force -ErrorAction SilentlyContinue
        $shell = New-Object -ComObject WScript.Shell
        foreach ($shortcutPath in @($desktopShortcut, $startMenuShortcut)) {
          New-Item -ItemType Directory -Force -Path (Split-Path -Parent $shortcutPath) | Out-Null
          $shortcut = $shell.CreateShortcut($shortcutPath)
          $shortcut.TargetPath = $exePath
          $shortcut.Arguments = ""
          $shortcut.WorkingDirectory = Split-Path -Parent $exePath
          $shortcut.IconLocation = "$exePath,0"
          $shortcut.Description = "Launch PC Life Assistant"
          $shortcut.Save()
        }
        [PSCustomObject]@{ TaskName = $taskName; Removed = $true }
      `;
  const result = await runElevatedJson(script);
  if (!result.ok) return result;
  return { ...(await getStatus()), removed: true };
}

async function launchElevated() {
  if (!(await taskExists())) return { ok: false, error: 'Administrator launch mode is not enabled.' };
  const result = await execFileCapture('schtasks.exe', ['/Run', '/TN', TASK_NAME], { timeout: 10000 });
  if (!result.ok) return { ok: false, error: result.error || result.stderr || 'Failed to launch elevated task.' };
  setTimeout(() => {
    try {
      app.quit();
    } catch (_) {}
  }, 800);
  return { ok: true };
}

module.exports = {
  TASK_NAME,
  getStatus,
  enable,
  disable,
  launchElevated,
};
