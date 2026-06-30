'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { app } = require('electron');
const { hashFile } = require('./shared/fileHash');

let activeScan = null;
let progressSender = null;

function appUserDataPath() {
  try {
    if (app && app.isReady()) return app.getPath('userData');
  } catch (_) {}
  return path.join(os.tmpdir(), 'pc-life-assistant');
}

function userDataPath(fileName) {
  return path.join(appUserDataPath(), fileName);
}

function securitySettingsPath() {
  return userDataPath('securitySettings.json');
}

function reputationCachePath() {
  return userDataPath('securityReputationCache.json');
}

async function readJsonObject(target) {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(target, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function writeJsonObject(target, value) {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, JSON.stringify(value, null, 2), 'utf-8');
}

async function getSettings() {
  const raw = await readJsonObject(securitySettingsPath());
  return {
    ok: true,
    path: securitySettingsPath(),
    settings: {
      hasVirusTotalKey: !!raw.virusTotalApiKey,
      allowFileUpload: raw.allowFileUpload === true,
      updatedAt: raw.updatedAt || '',
    },
  };
}

async function saveSettings(patch = {}) {
  const current = await readJsonObject(securitySettingsPath());
  const next = {
    ...current,
    allowFileUpload: patch.allowFileUpload === true,
    updatedAt: new Date().toISOString(),
  };
  if (typeof patch.virusTotalApiKey === 'string') {
    const trimmed = patch.virusTotalApiKey.trim();
    if (trimmed) next.virusTotalApiKey = trimmed;
  }
  if (patch.clearVirusTotalKey) delete next.virusTotalApiKey;
  await writeJsonObject(securitySettingsPath(), next);
  return getSettings();
}

async function resolveMpCmdRun() {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const platformRoot = path.join(programData, 'Microsoft', 'Windows Defender', 'Platform');
  try {
    const entries = await fs.promises.readdir(platformRoot, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(platformRoot, entry.name, 'MpCmdRun.exe'))
      .sort()
      .reverse();
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_) {}
  const fallback = path.join(
    process.env.ProgramFiles || 'C:\\Program Files',
    'Windows Defender',
    'MpCmdRun.exe',
  );
  return fs.existsSync(fallback) ? fallback : '';
}

function parseThreatCount(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('found no threats') || lower.includes('no threats')) return 0;
  const match = lower.match(/threats?\s+found\s*:\s*(\d+)/i) || lower.match(/found\s+(\d+)\s+threat/i);
  return match ? Number(match[1]) : lower.includes('threat') ? 1 : 0;
}

function emit(channel, payload) {
  if (progressSender && !progressSender.isDestroyed()) progressSender.send(channel, payload);
}

async function startScan(payload = {}, sender) {
  if (activeScan) return { ok: false, error: 'A Defender scan is already running.' };
  progressSender = sender || progressSender;
  const type = payload.type || 'quick';
  if (type === 'offline') return startOfflineScan();

  const mpCmdRun = await resolveMpCmdRun();
  if (!mpCmdRun) return { ok: false, error: 'MpCmdRun.exe was not found.' };

  const args = ['-Scan'];
  if (type === 'full') args.push('-ScanType', '2');
  else if (type === 'custom') {
    if (!payload.path) return { ok: false, error: 'Custom scan requires a path.' };
    args.push('-ScanType', '3', '-File', payload.path);
  } else args.push('-ScanType', '1');

  const startedAt = Date.now();
  const lines = [];
  let threats = 0;
  emit('antivirus:scanProgress', {
    type,
    phase: 'Starting Defender scan',
    elapsed: 0,
    line: '',
    threats: 0,
  });

  return new Promise((resolve) => {
    const child = spawn(mpCmdRun, args, { windowsHide: true });
    activeScan = child;
    const onLine = (chunk) => {
      String(chunk)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          lines.push(line);
          threats = Math.max(threats, parseThreatCount(line));
          emit('antivirus:scanProgress', {
            type,
            phase: 'Scanning',
            elapsed: Date.now() - startedAt,
            line,
            threats,
          });
        });
    };
    child.stdout.on('data', onLine);
    child.stderr.on('data', onLine);
    child.on('error', (err) => {
      activeScan = null;
      const result = { ok: false, type, error: err.message, lines };
      emit('antivirus:scanResult', result);
      resolve(result);
    });
    child.on('close', (code) => {
      activeScan = null;
      threats = Math.max(threats, parseThreatCount(lines.join('\n')));
      const result = {
        ok: code === 0,
        type,
        exitCode: code,
        threats,
        elapsed: Date.now() - startedAt,
        lines,
        summary: threats > 0 ? `Found ${threats} potential threat(s).` : 'No threats found.',
      };
      emit('antivirus:scanResult', result);
      resolve(result);
    });
  });
}

function cancelScan() {
  if (!activeScan) return { ok: true, cancelled: false };
  activeScan.kill();
  activeScan = null;
  emit('antivirus:scanResult', { ok: false, cancelled: true, summary: 'Scan cancelled.' });
  return { ok: true, cancelled: true };
}

function execPowerShell(script, timeout = 45000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: stderr || err.message, stdout: stdout || '' });
        return resolve({ ok: true, stdout: stdout || '' });
      },
    );
  });
}

function parseJson(stdout, fallback) {
  try {
    return JSON.parse(stdout);
  } catch (_) {
    return fallback;
  }
}

async function runElevatedJson(innerScript) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scriptPath = path.join(os.tmpdir(), `pla-elevated-${id}.ps1`);
  const resultPath = path.join(os.tmpdir(), `pla-elevated-${id}.json`);
  const script = `
    $ErrorActionPreference = "Stop"
    try {
      $result = & {
${innerScript}
      }
      @{ ok = $true; result = $result } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "${resultPath}" -Encoding UTF8
    } catch {
      @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "${resultPath}" -Encoding UTF8
    }
  `;
  await fs.promises.writeFile(scriptPath, script, 'utf-8');
  const launcher = `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath}')`;
  const launched = await execPowerShell(launcher, 300000);
  if (!launched.ok) return { ok: false, error: launched.error };
  const parsed = await readJsonObject(resultPath);
  fs.promises.rm(scriptPath, { force: true }).catch(() => {});
  fs.promises.rm(resultPath, { force: true }).catch(() => {});
  return parsed.ok ? { ok: true, result: parsed.result } : { ok: false, error: parsed.error || 'Elevated action failed.' };
}

async function startOfflineScan() {
  return runElevatedJson('Start-MpWDOScan | Out-Null; "Offline scan scheduled"');
}

async function listThreats() {
  const script = `
    $ErrorActionPreference = "SilentlyContinue"
    [PSCustomObject]@{
      Threats = @(Get-MpThreat | Select-Object ThreatID,ThreatName,SeverityID,CategoryID,DidThreatExecute,IsActive,Resources)
      Detections = @(Get-MpThreatDetection | Select-Object ThreatID,ThreatName,InitialDetectionTime,LastThreatStatusChangeTime,ThreatStatusID,ActionSuccess,Resources)
      Quarantine = @(& "${await resolveMpCmdRun()}" -Restore -ListAll 2>$null)
    } | ConvertTo-Json -Depth 8
  `;
  const result = await execPowerShell(script, 60000);
  if (!result.ok) return { ok: false, error: result.error };
  const parsed = parseJson(result.stdout, {});
  return {
    ok: true,
    threats: Array.isArray(parsed.Threats) ? parsed.Threats : parsed.Threats ? [parsed.Threats] : [],
    detections: Array.isArray(parsed.Detections)
      ? parsed.Detections
      : parsed.Detections
        ? [parsed.Detections]
        : [],
    quarantine: Array.isArray(parsed.Quarantine)
      ? parsed.Quarantine.filter(Boolean)
      : parsed.Quarantine
        ? [parsed.Quarantine]
        : [],
  };
}

async function removeThreat() {
  return runElevatedJson('Remove-MpThreat | Out-Null; "Threat removal requested"');
}

async function restoreThreat(payload = {}) {
  const name = String(payload.name || payload.threatName || '').replace(/'/g, "''");
  if (!name) return { ok: false, error: 'Threat name is required.' };
  const mpCmdRun = await resolveMpCmdRun();
  return runElevatedJson(`& '${mpCmdRun}' -Restore -Name '${name}' | Out-String`);
}

async function allowThreat(payload = {}) {
  const target = String(payload.path || '').replace(/'/g, "''");
  if (!target) return { ok: false, error: 'Path is required.' };
  return runElevatedJson(`Add-MpPreference -ExclusionPath '${target}' | Out-Null; "Allowed ${target}"`);
}

async function getReputationCache() {
  const parsed = await readJsonObject(reputationCachePath());
  return parsed && typeof parsed.entries === 'object' ? parsed.entries : {};
}

async function saveReputationCache(entries) {
  await writeJsonObject(reputationCachePath(), {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: Object.fromEntries(Object.entries(entries || {}).slice(-1000)),
  });
}

async function reputationTarget(pathOrHash) {
  const value = String(pathOrHash || '').trim();
  if (/^[a-f0-9]{64}$/i.test(value)) return { sha256: value.toLowerCase(), cacheKey: value.toLowerCase() };
  const stat = await fs.promises.stat(value);
  const sha256 = await hashFile(value);
  return {
    path: value,
    sha256,
    cacheKey: `${value.toLowerCase()}|${stat.size}|${stat.mtimeMs}`,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

async function checkReputation(pathOrHash) {
  const settings = await readJsonObject(securitySettingsPath());
  if (!settings.virusTotalApiKey) return { ok: false, disabled: true, error: 'VirusTotal API key is not configured.' };
  const target = await reputationTarget(pathOrHash);
  const cache = await getReputationCache();
  if (cache[target.cacheKey]) return { ok: true, cached: true, ...cache[target.cacheKey] };

  const response = await fetch(`https://www.virustotal.com/api/v3/files/${target.sha256}`, {
    headers: { 'x-apikey': settings.virusTotalApiKey },
  });
  if (response.status === 404) {
    return { ok: false, unknown: true, sha256: target.sha256, error: 'VirusTotal has no record for this hash.' };
  }
  if (!response.ok) return { ok: false, error: `VirusTotal request failed (${response.status}).` };
  const body = await response.json();
  const stats = body?.data?.attributes?.last_analysis_stats || {};
  const verdict =
    Number(stats.malicious || 0) > 0 || Number(stats.suspicious || 0) > 0
      ? 'suspicious'
      : 'clean';
  const result = { sha256: target.sha256, stats, verdict, checkedAt: new Date().toISOString() };
  cache[target.cacheKey] = result;
  await saveReputationCache(cache);
  return { ok: true, ...result };
}

async function uploadToVirusTotal(filePath) {
  const settings = await readJsonObject(securitySettingsPath());
  if (!settings.virusTotalApiKey) return { ok: false, error: 'VirusTotal API key is not configured.' };
  if (settings.allowFileUpload !== true) return { ok: false, error: 'File upload is disabled. Enable opt-in upload first.' };
  const bytes = await fs.promises.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes]), path.basename(filePath));
  const response = await fetch('https://www.virustotal.com/api/v3/files', {
    method: 'POST',
    headers: { 'x-apikey': settings.virusTotalApiKey },
    body: form,
  });
  if (!response.ok) return { ok: false, error: `VirusTotal upload failed (${response.status}).` };
  const body = await response.json();
  return { ok: true, analysis: body?.data || body };
}

module.exports = {
  securitySettingsPath,
  reputationCachePath,
  getSettings,
  saveSettings,
  resolveMpCmdRun,
  startScan,
  cancelScan,
  listThreats,
  removeThreat,
  restoreThreat,
  allowThreat,
  checkReputation,
  uploadToVirusTotal,
};
