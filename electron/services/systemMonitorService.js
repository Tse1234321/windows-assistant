'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * System monitor service.
 * Uses only the Node.js `os` module + `fs.statfs` (cross-platform, no native deps).
 */

// Keep a small rolling history of CPU samples so we can approximate
// "CPU has been high for a while" rather than reacting to a single spike.
const CPU_HISTORY_MAX = 10;
const cpuHistory = [];

function cpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/**
 * Measures CPU usage over a short window (default 250ms) and returns 0-100 (%).
 */
function getCpuUsage(sampleMs = 250) {
  return new Promise((resolve) => {
    const start = cpuTimes();
    setTimeout(() => {
      const end = cpuTimes();
      const idleDelta = end.idle - start.idle;
      const totalDelta = end.total - start.total;
      let usage = 0;
      if (totalDelta > 0) {
        usage = (1 - idleDelta / totalDelta) * 100;
      }
      usage = Math.max(0, Math.min(100, Math.round(usage)));
      cpuHistory.push(usage);
      if (cpuHistory.length > CPU_HISTORY_MAX) cpuHistory.shift();
      resolve(usage);
    }, sampleMs);
  });
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
  return {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    usagePercent,
  };
}

function defaultDrivePath() {
  // On Windows use the system drive (usually C:\), otherwise the filesystem root.
  if (process.platform === 'win32') {
    const sysDrive = process.env.SystemDrive || 'C:';
    return sysDrive.endsWith('\\') ? sysDrive : sysDrive + '\\';
  }
  return '/';
}

async function getDiskUsage(targetPath) {
  const drivePath = targetPath && targetPath.trim() ? targetPath : defaultDrivePath();
  try {
    // fs.statfs is available in Node 18.15+ and works on Windows/macOS/Linux.
    const stats = await fs.promises.statfs(drivePath);
    const blockSize = stats.bsize;
    const total = stats.blocks * blockSize;
    const free = stats.bavail * blockSize;
    const used = total - free;
    const freePercent = total > 0 ? Math.round((free / total) * 100) : 0;
    const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;
    return { ok: true, drive: drivePath, total, free, used, freePercent, usedPercent };
  } catch (err) {
    return {
      ok: false,
      drive: drivePath,
      error: `無法讀取磁碟資訊：${err.message}`,
      total: 0,
      free: 0,
      used: 0,
      freePercent: 0,
      usedPercent: 0,
    };
  }
}

/**
 * Auto-detect available drives.
 * Windows: probe drive letters C: through Z: (skip A:/B: floppy legacy).
 * Other platforms: just the filesystem root.
 */
async function detectDrives() {
  if (process.platform !== 'win32') return ['/'];
  const letters = [];
  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
    letters.push(`${String.fromCharCode(code)}:\\`);
  }
  const checks = await Promise.all(
    letters.map(async (drive) => {
      try {
        await fs.promises.statfs(drive);
        return drive;
      } catch (_) {
        return null; // drive letter not mounted
      }
    })
  );
  const found = checks.filter(Boolean);
  return found.length > 0 ? found : [defaultDrivePath()];
}

/**
 * Resolve which drives to monitor, with backward compatibility:
 *   1. monitorDrives (array, non-empty) — preferred
 *   2. monitorDrive (legacy string) — used if monitorDrives is absent/empty
 *   3. otherwise auto-detect all available drives
 */
async function resolveDrives(options = {}) {
  const { monitorDrives, monitorDrive } = options;
  if (Array.isArray(monitorDrives) && monitorDrives.filter((d) => d && d.trim()).length > 0) {
    return monitorDrives.filter((d) => d && d.trim());
  }
  if (monitorDrive && monitorDrive.trim()) {
    return [monitorDrive.trim()];
  }
  return detectDrives();
}

/**
 * Returns disk usage for every monitored drive. A failure on one drive never
 * affects the others — it comes back as an entry with ok:false + error.
 */
async function getDisksUsage(options = {}) {
  const drives = await resolveDrives(options);
  return Promise.all(drives.map((drive) => getDiskUsage(drive)));
}

async function getMetrics(options = {}) {
  const cpu = await getCpuUsage();
  const memory = getMemoryUsage();
  const disks = await getDisksUsage(options);
  const uptimeSeconds = os.uptime();
  const sustainedHighCpu =
    cpuHistory.length >= 3 &&
    cpuHistory.slice(-3).every((v) => v > 80);

  return {
    cpu: {
      usagePercent: cpu,
      sustainedHigh: sustainedHighCpu,
      cores: os.cpus().length,
    },
    memory,
    disks,
    uptimeSeconds,
    hostname: os.hostname(),
    platform: process.platform,
  };
}

/**
 * PC Health Score.
 * Starts at 100 and subtracts penalties. Returns score + the list of applied deductions.
 */
function computeHealthScore(metrics, extras = {}) {
  const { unsortedDownloads = 0, hasStaleProject = false } = extras;
  let score = 100;
  const deductions = [];

  if (metrics.memory.usagePercent > 80) {
    score -= 10;
    deductions.push({ reason: `RAM 使用率 ${metrics.memory.usagePercent}%（> 80%）`, points: -10 });
  }
  // Any monitored drive below 20% free triggers the disk penalty once.
  const lowDrives = (metrics.disks || []).filter((d) => d.ok && d.freePercent < 20);
  if (lowDrives.length > 0) {
    score -= 15;
    deductions.push({
      reason: `磁碟剩餘空間不足（< 20%）：${lowDrives
        .map((d) => `${d.drive} ${d.freePercent}%`)
        .join('、')}`,
      points: -15,
    });
  }
  if (metrics.cpu.sustainedHigh) {
    score -= 10;
    deductions.push({ reason: 'CPU 長時間使用率 > 80%', points: -10 });
  }
  if (unsortedDownloads > 50) {
    score -= 5;
    deductions.push({ reason: `Downloads 未分類檔案 ${unsortedDownloads} 個（> 50）`, points: -5 });
  }
  if (hasStaleProject) {
    score -= 10;
    deductions.push({ reason: '有專案超過 24 小時未 commit', points: -10 });
  }

  score = Math.max(0, Math.min(100, score));
  let status = '良好';
  if (score < 60) status = '需要注意';
  else if (score < 80) status = '尚可';

  return { score, status, deductions };
}

module.exports = {
  getCpuUsage,
  getMemoryUsage,
  getDiskUsage,
  getDisksUsage,
  detectDrives,
  resolveDrives,
  getMetrics,
  computeHealthScore,
  defaultDrivePath,
};
