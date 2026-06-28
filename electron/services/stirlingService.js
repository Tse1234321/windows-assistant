'use strict';

/**
 * Stirling-PDF integration service.
 *
 * Stirling-PDF (https://github.com/Stirling-Tools/Stirling-PDF) is a local,
 * self-hosted Java (Spring Boot) PDF toolbox that serves a web UI + REST API.
 *
 * Licensing note: Stirling-PDF is *open-core* — its prebuilt JAR bundles some
 * proprietary modules, so we MUST NOT bundle or redistribute it. Instead we
 * download the official release JAR to the user's machine on first use
 * (personal use, not redistribution) and run it locally.
 *
 * Runtime note: recent Stirling-PDF builds require Java 25. Rather than depend
 * on whatever Java the user has, we can fetch a portable Temurin JRE 25 on
 * demand and run Stirling with it (also downloaded to the user's machine, not
 * bundled). If the user already has a new enough system Java, we use that.
 *
 * This service: provisions the runtime + JAR with progress, starts/stops the
 * server on a free local port, and reports status. The renderer embeds the UI.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const https = require('https');
const { execFile, spawn } = require('child_process');

let electronApp = null;
try {
  electronApp = require('electron').app;
} catch (_) {
  /* keep usable in Node smoke tests */
}

const REPO = 'Stirling-Tools/Stirling-PDF';
const JAR_NAME = 'Stirling-PDF.jar';
// GitHub's "latest/download" URL always 302-redirects to the newest release asset.
const JAR_URL = `https://github.com/${REPO}/releases/latest/download/${JAR_NAME}`;
const REQUIRED_JAVA_MAJOR = 25;
// Adoptium Temurin JRE 25 (Windows x64 .zip) — 307-redirects to the release asset.
const JRE_URL =
  'https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jre/hotspot/normal/eclipse';
const READY_TIMEOUT_MS = 180000; // first boot of the Java server can be slow

let serverProc = null;
let server = { running: false, starting: false, port: null, url: '', startedAt: null, error: '' };
let download = { active: false, kind: null, receivedBytes: 0, totalBytes: 0, percent: 0 };
let cachedVersion = '';

function userDataDir() {
  try {
    if (electronApp) return electronApp.getPath('userData');
  } catch (_) {
    /* fall through */
  }
  return path.join(os.homedir(), '.pc-life-assistant');
}

function stirlingDir() {
  return path.join(userDataDir(), 'stirling');
}

function jarPath() {
  return path.join(stirlingDir(), JAR_NAME);
}

function jreDir() {
  return path.join(stirlingDir(), 'jre');
}

function jarInfo() {
  try {
    const stat = fs.statSync(jarPath());
    return { present: stat.isFile() && stat.size > 1024 * 1024, sizeBytes: stat.size };
  } catch (_) {
    return { present: false, sizeBytes: 0 };
  }
}

// Locate java.exe inside the on-demand JRE (the zip extracts to e.g. jdk-25.x-jre/).
function findBundledJavaExe() {
  try {
    const root = jreDir();
    if (!fs.existsSync(root)) return '';
    const direct = path.join(root, 'bin', 'java.exe');
    if (fs.existsSync(direct)) return direct;
    for (const entry of fs.readdirSync(root)) {
      const exe = path.join(root, entry, 'bin', 'java.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (_) {
    /* ignore */
  }
  return '';
}

// --- Java detection -------------------------------------------------------
function detectSystemJava() {
  return new Promise((resolve) => {
    execFile('java', ['-version'], { timeout: 7000, windowsHide: true }, (err, stdout, stderr) => {
      const out = `${stdout || ''}\n${stderr || ''}`.trim();
      if (err && !out) {
        resolve({ major: 0, version: '', raw: '' });
        return;
      }
      // e.g. java version "25.0.3"  /  openjdk version "21.0.8"  /  "1.8.0_381"
      const match = out.match(/version "(\d+)(?:\.(\d+))?[^"]*"/);
      const first = Number(match && match[1]);
      const major = first === 1 && match[2] ? Number(match[2]) : first || 0;
      const version = match ? match[0].replace(/^.*version "([^"]+)".*$/, '$1') : '';
      resolve({ major, version, raw: out.split(/\r?\n/)[0].trim() });
    });
  });
}

// Reports whether a usable runtime exists (bundled JRE, or system Java >= required).
async function detectJava() {
  const sys = await detectSystemJava();
  const bundled = findBundledJavaExe();
  const systemOk = sys.major >= REQUIRED_JAVA_MAJOR;
  return {
    required: REQUIRED_JAVA_MAJOR,
    systemAvailable: sys.major > 0,
    systemMajor: sys.major,
    systemVersion: sys.version,
    systemOk,
    bundled: !!bundled,
    bundledPath: bundled,
    available: systemOk || !!bundled,
    ok: systemOk || !!bundled,
    source: bundled ? 'bundled' : systemOk ? 'system' : 'none',
    raw: sys.raw,
  };
}

async function resolveJavaExe() {
  const bundled = findBundledJavaExe();
  if (bundled) return bundled;
  const sys = await detectSystemJava();
  if (sys.major >= REQUIRED_JAVA_MAJOR) return 'java';
  return '';
}

// --- Free port ------------------------------------------------------------
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function findFreePort(preferred) {
  if (preferred && (await isPortFree(preferred))) return preferred;
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// --- HTTP GET with redirect following -------------------------------------
function httpGet(url, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'PC-Life-Assistant' } }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        const next = new URL(headers.location, url).toString();
        resolve(httpGet(next, redirectsLeft - 1));
        return;
      }
      if (statusCode !== 200) {
        res.resume();
        reject(new Error(`Download failed: HTTP ${statusCode}`));
        return;
      }
      resolve({ res, finalUrl: url });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Connection timed out')));
  });
}

// Stream a response to a file, emitting throttled progress.
function streamToFile(res, dest, total, onProgress, kind) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    let received = 0;
    let lastEmit = 0;
    res.on('data', (chunk) => {
      received += chunk.length;
      download.receivedBytes = received;
      download.percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
      const now = Date.now();
      if (typeof onProgress === 'function' && now - lastEmit > 200) {
        lastEmit = now;
        onProgress({ kind, receivedBytes: received, totalBytes: total, percent: download.percent });
      }
    });
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => resolve(received));
    res.pipe(out);
  });
}

// Extract a .zip using PowerShell's Expand-Archive (Windows built-in).
function extractZip(zip, dest) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`Extract failed: ${(stderr || err.message || '').trim()}`));
        else resolve();
      },
    );
  });
}

// --- Download the runtime (Temurin JRE 25) --------------------------------
async function downloadJre(onProgress) {
  if (download.active) return { ok: false, error: 'A download is already in progress.' };
  if (server.running || server.starting) return { ok: false, error: 'Stop Stirling-PDF first.' };

  fs.mkdirSync(jreDir(), { recursive: true });
  const zip = path.join(jreDir(), 'jre-download.zip');
  download = { active: true, kind: 'jre', receivedBytes: 0, totalBytes: 0, percent: 0 };

  try {
    const { res } = await httpGet(JRE_URL);
    const total = Number(res.headers['content-length']) || 0;
    download.totalBytes = total;
    await streamToFile(res, zip, total, onProgress, 'jre');
    if (typeof onProgress === 'function')
      onProgress({ kind: 'jre', percent: 99, extracting: true });
    await extractZip(zip, jreDir());
    try {
      fs.unlinkSync(zip);
    } catch (_) {
      /* ignore */
    }

    const exe = findBundledJavaExe();
    download = { active: false, kind: null, receivedBytes: 0, totalBytes: 0, percent: 0 };
    if (!exe) return { ok: false, error: 'JRE extracted but java.exe was not found.' };
    if (typeof onProgress === 'function') onProgress({ kind: 'jre', percent: 100, done: true });
    return { ok: true, javaExe: exe };
  } catch (err) {
    download = { active: false, kind: null, receivedBytes: 0, totalBytes: 0, percent: 0 };
    try {
      if (fs.existsSync(zip)) fs.unlinkSync(zip);
    } catch (_) {
      /* ignore */
    }
    return { ok: false, error: err.message };
  }
}

// --- Download the JAR -----------------------------------------------------
async function downloadJar(onProgress) {
  if (download.active) return { ok: false, error: 'A download is already in progress.' };
  if (server.running || server.starting)
    return { ok: false, error: 'Stop Stirling-PDF before re-downloading.' };

  fs.mkdirSync(stirlingDir(), { recursive: true });
  const tmp = `${jarPath()}.part`;
  download = { active: true, kind: 'jar', receivedBytes: 0, totalBytes: 0, percent: 0 };

  try {
    const { res, finalUrl } = await httpGet(JAR_URL);
    const tagMatch = finalUrl.match(/\/releases\/download\/([^/]+)\//);
    if (tagMatch) cachedVersion = tagMatch[1];

    const total = Number(res.headers['content-length']) || 0;
    download.totalBytes = total;
    const received = await streamToFile(res, tmp, total, onProgress, 'jar');

    const stat = fs.statSync(tmp);
    if (total && Math.abs(stat.size - total) > 1024) {
      throw new Error(`Incomplete download (${stat.size} of ${total} bytes).`);
    }
    const fd = fs.openSync(tmp, 'r');
    const head = Buffer.alloc(2);
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
    if (head[0] !== 0x50 || head[1] !== 0x4b) {
      throw new Error('Downloaded file is not a valid JAR (bad signature).');
    }

    fs.renameSync(tmp, jarPath());
    download = {
      active: false,
      kind: null,
      receivedBytes: stat.size,
      totalBytes: stat.size,
      percent: 100,
    };
    if (typeof onProgress === 'function')
      onProgress({
        kind: 'jar',
        receivedBytes: stat.size,
        totalBytes: stat.size,
        percent: 100,
        done: true,
      });
    return { ok: true, path: jarPath(), version: cachedVersion, sizeBytes: stat.size, received };
  } catch (err) {
    download = { active: false, kind: null, receivedBytes: 0, totalBytes: 0, percent: 0 };
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
    return { ok: false, error: err.message };
  }
}

// --- Wait until the HTTP server answers -----------------------------------
function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode > 0);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForReady(port, onLog) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  return new Promise((resolve) => {
    const tick = async () => {
      if (!serverProc) {
        resolve(false);
        return;
      }
      if (await pingServer(port)) {
        resolve(true);
        return;
      }
      if (Date.now() > deadline) {
        if (typeof onLog === 'function') onLog('[stirling] readiness timeout');
        resolve(false);
        return;
      }
      setTimeout(tick, 1500);
    };
    setTimeout(tick, 2500);
  });
}

// --- Start / stop ---------------------------------------------------------
async function start(options = {}, onLog, onStatus) {
  if (server.running) return { ok: true, ...publicServerState() };
  if (server.starting) return { ok: false, error: 'Stirling-PDF is already starting.' };
  if (!jarInfo().present)
    return { ok: false, code: 'JAR_MISSING', error: 'Stirling-PDF JAR is not downloaded yet.' };

  const javaExe = await resolveJavaExe();
  if (!javaExe) {
    return {
      ok: false,
      code: 'JAVA_MISSING',
      error: `Java ${REQUIRED_JAVA_MAJOR} is required. Download the runtime first.`,
    };
  }

  const port = await findFreePort(Number(options.port) || 8099);
  server = {
    running: false,
    starting: true,
    port,
    url: `http://127.0.0.1:${port}`,
    startedAt: Date.now(),
    error: '',
  };
  if (typeof onStatus === 'function') onStatus(publicServerState());

  const emit = (line) => {
    if (line && typeof onLog === 'function') onLog(line);
  };

  try {
    serverProc = spawn(javaExe, ['-jar', jarPath(), `--server.port=${port}`], {
      cwd: stirlingDir(),
      windowsHide: true,
      env: { ...process.env, SERVER_PORT: String(port), STIRLING_PDF_DESKTOP_UI: 'false' },
    });
  } catch (err) {
    server = {
      running: false,
      starting: false,
      port: null,
      url: '',
      startedAt: null,
      error: err.message,
    };
    return { ok: false, error: `Failed to launch Java: ${err.message}` };
  }

  serverProc.stdout.on('data', (d) => emit(String(d).trimEnd()));
  serverProc.stderr.on('data', (d) => emit(String(d).trimEnd()));
  serverProc.on('exit', (code) => {
    const wasStarting = server.starting;
    serverProc = null;
    server = {
      running: false,
      starting: false,
      port: null,
      url: '',
      startedAt: null,
      error: wasStarting ? `Java exited (code ${code}) before the server was ready.` : '',
    };
    emit(`[stirling] process exited (code ${code})`);
    if (typeof onStatus === 'function') onStatus(publicServerState());
  });

  const ready = await waitForReady(port, emit);
  if (!ready || !serverProc) {
    stop();
    server = {
      running: false,
      starting: false,
      port: null,
      url: '',
      startedAt: null,
      error: 'Stirling-PDF did not become ready in time.',
    };
    if (typeof onStatus === 'function') onStatus(publicServerState());
    return { ok: false, error: server.error };
  }

  server = {
    running: true,
    starting: false,
    port,
    url: `http://127.0.0.1:${port}`,
    startedAt: Date.now(),
    error: '',
  };
  if (typeof onStatus === 'function') onStatus(publicServerState());
  return { ok: true, ...publicServerState() };
}

function stop() {
  const proc = serverProc;
  serverProc = null;
  if (proc && proc.pid) {
    try {
      if (process.platform === 'win32') {
        execFile(
          'taskkill',
          ['/pid', String(proc.pid), '/T', '/F'],
          { windowsHide: true },
          () => {},
        );
      } else {
        proc.kill('SIGTERM');
      }
    } catch (_) {
      try {
        proc.kill();
      } catch (__) {
        /* ignore */
      }
    }
  }
  server = { running: false, starting: false, port: null, url: '', startedAt: null, error: '' };
  return { ok: true };
}

function publicServerState() {
  return {
    running: server.running,
    starting: server.starting,
    port: server.port,
    url: server.url,
    error: server.error,
  };
}

async function getStatus() {
  const java = await detectJava();
  const jar = jarInfo();
  return {
    ok: true,
    java,
    jar: { ...jar, path: jarPath(), version: cachedVersion },
    download: { ...download },
    server: publicServerState(),
    dir: stirlingDir(),
    repo: REPO,
    requiredJava: REQUIRED_JAVA_MAJOR,
  };
}

module.exports = {
  REPO,
  JAR_NAME,
  REQUIRED_JAVA_MAJOR,
  detectJava,
  downloadJre,
  downloadJar,
  start,
  stop,
  getStatus,
  jarPath,
  stirlingDir,
};
