'use strict';

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const electron = require('electron');

const activityHistoryService = require('./activityHistoryService');
const automationService = require('./automationService');
const cleanupService = require('./cleanupService');
const notificationService = require('./notificationService');
const projectService = require('./projectService');
const systemMonitorService = require('./systemMonitorService');

const app = electron.app;

const SCAN_LIMITS = {
  maxDepth: 3,
  maxFiles: 12000,
  maxDirs: 900,
};

const BROWSE_LIMITS = {
  maxFolders: 80,
  maxFiles: 220,
};

const PREVIEW_LIMITS = Object.freeze({
  maxTextReadBytes: 256 * 1024,
  maxReturnedCharacters: 200000,
  maxReturnedLines: 3000,
  maxImageBytes: 5 * 1024 * 1024,
  registryMaxEntries: 6000,
  registryTtlMs: 30 * 60 * 1000,
});

const PREVIEW_ERRORS = Object.freeze({
  invalidRequest: 'invalid_request',
  invalidNode: 'invalid_node',
  outsideAuthorizedRoot: 'outside_authorized_root',
  notFound: 'not_found',
  accessDenied: 'access_denied',
  notFile: 'not_file',
  unsupportedType: 'unsupported_type',
  tooLarge: 'too_large',
  binary: 'binary',
  readFailed: 'read_failed',
});

const TEXT_PREVIEW_TYPES = new Map([
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.csv', 'text/csv'],
  ['.json', 'application/json'],
  ['.jsonc', 'application/json'],
  ['.xml', 'application/xml'],
  ['.yaml', 'text/yaml'],
  ['.yml', 'text/yaml'],
  ['.ini', 'text/plain'],
  ['.cfg', 'text/plain'],
  ['.conf', 'text/plain'],
  ['.toml', 'text/plain'],
  ['.log', 'text/plain'],
  ['.js', 'text/javascript'],
  ['.jsx', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.cjs', 'text/javascript'],
  ['.ts', 'text/typescript'],
  ['.tsx', 'text/typescript'],
  ['.css', 'text/css'],
  ['.scss', 'text/x-scss'],
  ['.py', 'text/x-python'],
  ['.java', 'text/x-java-source'],
  ['.c', 'text/x-c'],
  ['.h', 'text/x-c'],
  ['.cpp', 'text/x-c++'],
  ['.hpp', 'text/x-c++'],
  ['.cs', 'text/x-csharp'],
  ['.go', 'text/x-go'],
  ['.rs', 'text/x-rust'],
  ['.sql', 'text/x-sql'],
  ['.ps1', 'text/plain'],
  ['.sh', 'text/plain'],
  ['.bat', 'text/plain'],
]);

const IMAGE_PREVIEW_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
]);

const TEXT_PREVIEW_NAMES = new Set([
  '.editorconfig',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  'dockerfile',
  'makefile',
  'license',
  'readme',
]);

const authorizedNodeRegistry = new Map();
const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

const SEARCH_LIMITS = {
  maxResults: 30,
  maxDepth: 6,
  maxDirs: 1500,
};

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.cache',
  '.next',
  '.nuxt',
  'venv',
  '.venv',
  '__pycache__',
]);

const EXT_GROUPS = {
  Documents: new Set([
    '.doc',
    '.docx',
    '.pdf',
    '.txt',
    '.md',
    '.rtf',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.csv',
  ]),
  Images: new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    '.tif',
    '.tiff',
    '.heic',
  ]),
  Videos: new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v']),
  Music: new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg']),
  Archives: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']),
  Code: new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.hpp',
    '.cs',
    '.go',
    '.rs',
    '.html',
    '.css',
    '.json',
    '.yml',
    '.yaml',
    '.ps1',
    '.sh',
  ]),
};

function safeAppPath(name, fallbackName) {
  try {
    if (app && app.isReady()) return app.getPath(name);
  } catch (_) {
    /* fall through */
  }
  return path.join(os.homedir(), fallbackName);
}

function dashboardFolderDefs() {
  return [
    ['desktop', 'Desktop', safeAppPath('desktop', 'Desktop'), 'files'],
    ['downloads', 'Downloads', safeAppPath('downloads', 'Downloads'), 'files'],
    ['documents', 'Documents', safeAppPath('documents', 'Documents'), 'files'],
    ['pictures', 'Pictures', safeAppPath('pictures', 'Pictures'), 'files'],
    ['videos', 'Videos', safeAppPath('videos', 'Videos'), 'files'],
    ['music', 'Music', safeAppPath('music', 'Music'), 'files'],
  ];
}

function statusForPercent(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return 'normal';
  if (percent >= 90) return 'danger';
  if (percent >= 75) return 'warning';
  if (percent <= 45) return 'good';
  return 'normal';
}

function statusForDisk(disk) {
  if (!disk || !disk.ok) return 'warning';
  if (disk.freePercent < 12) return 'danger';
  if (disk.freePercent < 25) return 'warning';
  if (disk.freePercent > 55) return 'good';
  return 'normal';
}

function statusForCount(count, warning, danger) {
  if (count >= danger) return 'danger';
  if (count >= warning) return 'warning';
  if (count > 0) return 'normal';
  return 'good';
}

async function statSafe(target) {
  try {
    return await fs.promises.stat(target);
  } catch (_) {
    return null;
  }
}

async function readDirSafe(target) {
  try {
    return await fs.promises.readdir(target, { withFileTypes: true });
  } catch (_) {
    return null;
  }
}

function emptyFolderStats(folderPath, label) {
  return {
    label,
    path: folderPath,
    count: 0,
    sizeBytes: 0,
    updatedAt: '',
    byExt: {},
    truncated: false,
    unavailable: false,
  };
}

async function scanFolder(folderPath, label) {
  const rootStat = await statSafe(folderPath);
  const stats = emptyFolderStats(folderPath, label);
  if (!rootStat || !rootStat.isDirectory()) {
    stats.unavailable = true;
    return stats;
  }

  let dirs = 0;

  async function walk(current, depth) {
    if (stats.count >= SCAN_LIMITS.maxFiles || dirs >= SCAN_LIMITS.maxDirs) {
      stats.truncated = true;
      return;
    }
    const entries = await readDirSafe(current);
    if (!entries) return;

    for (const entry of entries) {
      if (stats.count >= SCAN_LIMITS.maxFiles || dirs >= SCAN_LIMITS.maxDirs) {
        stats.truncated = true;
        return;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth >= SCAN_LIMITS.maxDepth || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        dirs += 1;
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStat = await statSafe(full);
      if (!fileStat) continue;
      const ext = path.extname(entry.name).toLowerCase() || '[none]';
      stats.count += 1;
      stats.sizeBytes += fileStat.size || 0;
      stats.byExt[ext] = (stats.byExt[ext] || 0) + 1;
      if (!stats.updatedAt || fileStat.mtimeMs > Date.parse(stats.updatedAt)) {
        stats.updatedAt = fileStat.mtime.toISOString();
      }
    }
  }

  await walk(folderPath, 0);
  return stats;
}

function stableNodeId(kind, targetPath) {
  const digest = crypto
    .createHash('sha256')
    .update(String(targetPath || '').toLowerCase(), 'utf8')
    .digest('hex')
    .slice(0, 24);
  return `dashboard-${kind}-${digest}`;
}

function invalidPreview(code, nodeId, message, meta) {
  return {
    ok: false,
    code,
    nodeId: typeof nodeId === 'string' ? nodeId : '',
    message,
    ...(meta ? { meta } : {}),
  };
}

function validNodeRequest(request) {
  return (
    request &&
    typeof request === 'object' &&
    !Array.isArray(request) &&
    typeof request.nodeId === 'string' &&
    NODE_ID_PATTERN.test(request.nodeId)
  );
}

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

async function canonicalizeExisting(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath || targetPath.includes('\0')) return null;
  try {
    return await fs.promises.realpath(path.resolve(targetPath));
  } catch (_) {
    return null;
  }
}

async function authorizationScope(config = {}) {
  const projectHub = projectService.normalizeProjectHub(config);
  const directoryCandidates = [
    ...dashboardFolderDefs().map(([, , folderPath]) => folderPath),
    ...(projectHub.scanRoots || []),
  ];
  const fileCandidates = [];

  for (const item of projectHub.pinnedProjects || []) {
    if (!item?.path) continue;
    if (item.isFile) fileCandidates.push(item.path);
    else directoryCandidates.push(item.path);
  }
  for (const item of Array.isArray(config.projects) ? config.projects : []) {
    if (typeof item === 'string') directoryCandidates.push(item);
    else if (item?.path) directoryCandidates.push(item.path);
  }

  const roots = [];
  const files = [];
  for (const candidate of directoryCandidates) {
    const canonical = await canonicalizeExisting(candidate);
    if (!canonical) continue;
    const stat = await statSafe(canonical);
    if (
      stat?.isDirectory() &&
      !roots.some((root) => root.toLowerCase() === canonical.toLowerCase())
    ) {
      roots.push(canonical);
    }
  }
  for (const candidate of fileCandidates) {
    const canonical = await canonicalizeExisting(candidate);
    if (!canonical) continue;
    const stat = await statSafe(canonical);
    if (stat?.isFile() && !files.some((file) => file.toLowerCase() === canonical.toLowerCase())) {
      files.push(canonical);
    }
  }
  return { roots, files };
}

function pathAllowed(scope, canonicalPath) {
  return (
    scope.files.some((file) => file.toLowerCase() === canonicalPath.toLowerCase()) ||
    scope.roots.some((root) => isPathInside(root, canonicalPath))
  );
}

function pruneAuthorizedNodes(now = Date.now()) {
  for (const [nodeId, record] of authorizedNodeRegistry) {
    if (record.expiresAt <= now) authorizedNodeRegistry.delete(nodeId);
  }
  while (authorizedNodeRegistry.size > PREVIEW_LIMITS.registryMaxEntries) {
    authorizedNodeRegistry.delete(authorizedNodeRegistry.keys().next().value);
  }
}

async function registerAuthorizedNode(nodeId, targetPath, config = {}, expectedKind, knownScope) {
  if (!NODE_ID_PATTERN.test(String(nodeId || ''))) return false;
  const canonical = await canonicalizeExisting(targetPath);
  if (!canonical) return false;
  const scope = knownScope || (await authorizationScope(config));
  if (!pathAllowed(scope, canonical)) return false;
  const stat = await statSafe(canonical);
  if (!stat) return false;
  const kind = stat.isDirectory() ? 'folder' : stat.isFile() ? 'file' : '';
  if (!kind || (expectedKind && kind !== expectedKind)) return false;
  pruneAuthorizedNodes();
  authorizedNodeRegistry.set(nodeId, {
    nodeId,
    canonicalPath: canonical,
    kind,
    expiresAt: Date.now() + PREVIEW_LIMITS.registryTtlMs,
  });
  return true;
}

async function resolveAuthorizedNode(request, config = {}) {
  if (!validNodeRequest(request)) {
    return invalidPreview(PREVIEW_ERRORS.invalidRequest, '', 'The node request is invalid.');
  }
  pruneAuthorizedNodes();
  const record = authorizedNodeRegistry.get(request.nodeId);
  if (!record) {
    return invalidPreview(PREVIEW_ERRORS.invalidNode, request.nodeId, 'The node is not indexed.');
  }
  const canonical = await canonicalizeExisting(record.canonicalPath);
  if (!canonical) {
    authorizedNodeRegistry.delete(request.nodeId);
    return invalidPreview(
      PREVIEW_ERRORS.notFound,
      request.nodeId,
      'The indexed item no longer exists.',
    );
  }
  const scope = await authorizationScope(config);
  if (!pathAllowed(scope, canonical)) {
    return invalidPreview(
      PREVIEW_ERRORS.outsideAuthorizedRoot,
      request.nodeId,
      'The indexed item is outside the authorized workspace.',
    );
  }
  const stat = await statSafe(canonical);
  if (!stat) {
    return invalidPreview(
      PREVIEW_ERRORS.notFound,
      request.nodeId,
      'The indexed item no longer exists.',
    );
  }
  const kind = stat.isDirectory() ? 'folder' : stat.isFile() ? 'file' : '';
  if (!kind || kind !== record.kind) {
    return invalidPreview(
      PREVIEW_ERRORS.invalidNode,
      request.nodeId,
      'The indexed item changed type.',
    );
  }
  record.expiresAt = Date.now() + PREVIEW_LIMITS.registryTtlMs;
  return { ok: true, record: { ...record, canonicalPath: canonical }, stat };
}

async function browseNode(request, config = {}) {
  const resolvedNode = await resolveAuthorizedNode(request, config);
  if (!resolvedNode.ok) return resolvedNode;
  const { record, stat: rootStat } = resolvedNode;
  if (!rootStat.isDirectory()) {
    return invalidPreview(
      PREVIEW_ERRORS.notFile,
      request.nodeId,
      'The node is not a browsable folder.',
    );
  }
  const entries = await readDirSafe(record.canonicalPath);
  if (!entries) {
    return invalidPreview(
      PREVIEW_ERRORS.accessDenied,
      request.nodeId,
      'The folder could not be read.',
    );
  }

  const folders = [];
  const files = [];
  const scope = await authorizationScope(config);
  let truncated = false;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (folders.length >= BROWSE_LIMITS.maxFolders) {
        truncated = true;
        continue;
      }
      const itemPath = path.join(record.canonicalPath, entry.name);
      folders.push({ id: stableNodeId('folder', itemPath), name: entry.name, path: itemPath });
    } else if (entry.isFile()) {
      if (files.length >= BROWSE_LIMITS.maxFiles) {
        truncated = true;
        continue;
      }
      const itemPath = path.join(record.canonicalPath, entry.name);
      files.push({ id: stableNodeId('file', itemPath), name: entry.name, path: itemPath });
    }
  }

  await Promise.all(
    folders.map(async (folder) => {
      await registerAuthorizedNode(folder.id, folder.path, config, 'folder', scope);
      const children = await readDirSafe(folder.path);
      folder.itemCount = children ? children.length : null;
      const stat = await statSafe(folder.path);
      folder.updatedAt = stat ? stat.mtime.toISOString() : '';
    }),
  );
  await Promise.all(
    files.map(async (file) => {
      await registerAuthorizedNode(file.id, file.path, config, 'file', scope);
      const stat = await statSafe(file.path);
      file.sizeBytes = stat ? stat.size : null;
      file.updatedAt = stat ? stat.mtime.toISOString() : '';
      file.ext = path.extname(file.name).toLowerCase();
    }),
  );

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));

  return {
    ok: true,
    nodeId: request.nodeId,
    name: path.basename(record.canonicalPath) || 'Workspace',
    folders,
    files,
    truncated,
  };
}

function previewMetadata(nodeId, canonicalPath, stat, mimeType = '') {
  return {
    nodeId,
    name: path.basename(canonicalPath),
    extension: path.extname(canonicalPath).toLowerCase(),
    mimeType,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

function previewType(canonicalPath) {
  const extension = path.extname(canonicalPath).toLowerCase();
  const baseName = path.basename(canonicalPath).toLowerCase();
  if (TEXT_PREVIEW_TYPES.has(extension) || TEXT_PREVIEW_NAMES.has(baseName)) {
    return { kind: 'text', mimeType: TEXT_PREVIEW_TYPES.get(extension) || 'text/plain' };
  }
  if (IMAGE_PREVIEW_TYPES.has(extension)) {
    return { kind: 'image', mimeType: IMAGE_PREVIEW_TYPES.get(extension) };
  }
  return { kind: 'unsupported', mimeType: '' };
}

function looksBinary(buffer) {
  if (!buffer.length) return false;
  let controls = 0;
  for (const value of buffer) {
    if (value === 0) return true;
    if (value < 9 || (value > 13 && value < 32)) controls += 1;
  }
  return controls / buffer.length > 0.02;
}

async function readTextPreview(record, stat, type) {
  const bytesToRead = Math.min(stat.size, PREVIEW_LIMITS.maxTextReadBytes + 4);
  const buffer = Buffer.alloc(bytesToRead);
  let handle;
  let bytesRead = 0;
  try {
    handle = await fs.promises.open(record.canonicalPath, 'r');
    ({ bytesRead } = await handle.read(buffer, 0, bytesToRead, 0));
  } catch (err) {
    const code =
      err?.code === 'EACCES' || err?.code === 'EPERM'
        ? PREVIEW_ERRORS.accessDenied
        : PREVIEW_ERRORS.readFailed;
    return invalidPreview(code, record.nodeId, 'The file could not be read.');
  } finally {
    await handle?.close().catch(() => {});
  }

  const slice = buffer.subarray(0, bytesRead);
  if (looksBinary(slice)) {
    return invalidPreview(
      PREVIEW_ERRORS.binary,
      record.nodeId,
      'Binary content is not returned as text.',
      previewMetadata(record.nodeId, record.canonicalPath, stat, type.mimeType),
    );
  }

  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(slice);
  } catch (_) {
    return invalidPreview(
      PREVIEW_ERRORS.binary,
      record.nodeId,
      'The file is not valid UTF-8 text.',
      previewMetadata(record.nodeId, record.canonicalPath, stat, type.mimeType),
    );
  }

  let content = decoded;
  let truncated = stat.size > PREVIEW_LIMITS.maxTextReadBytes;
  if (content.length > PREVIEW_LIMITS.maxReturnedCharacters) {
    content = content.slice(0, PREVIEW_LIMITS.maxReturnedCharacters);
    truncated = true;
  }
  const lines = content.split(/\r?\n/);
  if (lines.length > PREVIEW_LIMITS.maxReturnedLines) {
    content = lines.slice(0, PREVIEW_LIMITS.maxReturnedLines).join('\n');
    truncated = true;
  }

  return {
    ok: true,
    code: 'ok',
    nodeId: record.nodeId,
    kind: 'text',
    encoding: 'utf-8',
    content,
    truncated,
    meta: previewMetadata(record.nodeId, record.canonicalPath, stat, type.mimeType),
  };
}

async function readImagePreview(record, stat, type) {
  const meta = previewMetadata(record.nodeId, record.canonicalPath, stat, type.mimeType);
  if (stat.size > PREVIEW_LIMITS.maxImageBytes) {
    return invalidPreview(
      PREVIEW_ERRORS.tooLarge,
      record.nodeId,
      'The image is too large for an inline preview.',
      meta,
    );
  }
  try {
    const buffer = await fs.promises.readFile(record.canonicalPath);
    return {
      ok: true,
      code: 'ok',
      nodeId: record.nodeId,
      kind: 'image',
      encoding: 'base64',
      dataUrl: `data:${type.mimeType};base64,${buffer.toString('base64')}`,
      truncated: false,
      meta,
    };
  } catch (err) {
    const code =
      err?.code === 'EACCES' || err?.code === 'EPERM'
        ? PREVIEW_ERRORS.accessDenied
        : PREVIEW_ERRORS.readFailed;
    return invalidPreview(code, record.nodeId, 'The image could not be read.', meta);
  }
}

async function previewNode(request, config = {}) {
  const resolvedNode = await resolveAuthorizedNode(request, config);
  if (!resolvedNode.ok) return resolvedNode;
  const { record, stat } = resolvedNode;
  if (!stat.isFile()) {
    return invalidPreview(
      PREVIEW_ERRORS.notFile,
      request.nodeId,
      'A directory cannot be previewed as a file.',
    );
  }
  const type = previewType(record.canonicalPath);
  const meta = previewMetadata(record.nodeId, record.canonicalPath, stat, type.mimeType);
  if (type.kind === 'unsupported') {
    return invalidPreview(
      PREVIEW_ERRORS.unsupportedType,
      request.nodeId,
      'This file type does not support inline preview.',
      meta,
    );
  }
  if (type.kind === 'image') return readImagePreview(record, stat, type);
  return readTextPreview(record, stat, type);
}

function node(input) {
  return {
    id: input.id,
    label: input.label,
    type: input.type,
    value: Number(input.value || 0),
    sizeBytes: input.sizeBytes,
    count: input.count,
    status: input.status || 'normal',
    path: input.path,
    updatedAt: input.updatedAt || '',
    route: input.route || 'dashboard',
    meta: input.meta || {},
  };
}

function normalizeFolderSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\\/g, '/')
    .trim();
}

function searchResultId(folderPath) {
  return stableNodeId('folder', folderPath);
}

async function immediateItemCount(folderPath) {
  const entries = await readDirSafe(folderPath);
  return entries ? entries.length : null;
}

function folderSearchNode(match, stat, itemCount) {
  return node({
    id: searchResultId(match.path),
    label: match.name,
    type: 'file',
    value: itemCount || 1,
    count: itemCount,
    status: 'normal',
    path: match.path,
    updatedAt: stat ? stat.mtime.toISOString() : '',
    route: 'files',
    meta: {
      folder: true,
      rootLabel: match.rootLabel,
      searchResult: true,
    },
  });
}

async function searchFolderNodes(query, config = {}) {
  const normalized = normalizeFolderSearch(query);
  if (!normalized) {
    return { ok: true, query: '', nodes: [], truncated: false, searchedDirs: 0 };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const matches = [];
  const seen = new Set();
  let searchedDirs = 0;
  let truncated = false;

  async function walk(rootPath, rootLabel, currentPath, depth) {
    if (searchedDirs >= SEARCH_LIMITS.maxDirs) {
      truncated = true;
      return;
    }

    const entries = await readDirSafe(currentPath);
    if (!entries) return;

    for (const entry of entries) {
      if (searchedDirs >= SEARCH_LIMITS.maxDirs) {
        truncated = true;
        return;
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;

      const resolved = path.resolve(path.join(currentPath, entry.name));
      const pathKey = resolved.toLowerCase();
      if (seen.has(pathKey)) continue;
      seen.add(pathKey);
      searchedDirs += 1;

      const relative = normalizeFolderSearch(path.relative(rootPath, resolved));
      const label = normalizeFolderSearch(entry.name);
      const fullPath = normalizeFolderSearch(resolved);
      const corpus = `${label} ${relative} ${fullPath} ${normalizeFolderSearch(rootLabel)}`;

      if (tokens.every((token) => corpus.includes(token))) {
        let score = 10;
        if (label === normalized) score += 120;
        else if (label.startsWith(normalized)) score += 90;
        else if (label.includes(normalized)) score += 60;
        if (relative.startsWith(normalized)) score += 40;
        if (relative.includes(normalized) || fullPath.includes(normalized)) score += 24;
        score -= depth * 3;

        matches.push({
          path: resolved,
          name: entry.name,
          rootLabel,
          depth,
          score,
        });
      }

      if (depth < SEARCH_LIMITS.maxDepth) {
        await walk(rootPath, rootLabel, resolved, depth + 1);
      }
    }
  }

  for (const [, label, folderPath] of dashboardFolderDefs()) {
    const resolvedRoot = path.resolve(folderPath);
    const rootStat = await statSafe(resolvedRoot);
    if (!rootStat || !rootStat.isDirectory()) continue;
    await walk(resolvedRoot, label, resolvedRoot, 1);
    if (searchedDirs >= SEARCH_LIMITS.maxDirs) break;
  }

  const selected = matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.depth - b.depth ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
    .slice(0, SEARCH_LIMITS.maxResults);

  const nodes = await Promise.all(
    selected.map(async (match) => {
      const [stat, itemCount] = await Promise.all([
        statSafe(match.path),
        immediateItemCount(match.path),
      ]);
      return folderSearchNode(match, stat, itemCount);
    }),
  );
  const scope = await authorizationScope(config);
  await Promise.all(
    nodes.map((searchNode) =>
      registerAuthorizedNode(searchNode.id, searchNode.path, config, 'folder', scope),
    ),
  );

  return {
    ok: true,
    query: normalized,
    nodes,
    truncated: truncated || matches.length > selected.length,
    searchedDirs,
  };
}

function fileNodeFromFolder(key, stats, route = 'files') {
  return node({
    id: `file-${key}`,
    label: stats.label,
    type: 'file',
    value: stats.sizeBytes || stats.count || 1,
    sizeBytes: stats.sizeBytes,
    count: stats.count,
    status: stats.unavailable ? 'warning' : statusForCount(stats.count, 500, 2000),
    path: stats.path,
    updatedAt: stats.updatedAt,
    route,
    meta: {
      truncated: stats.truncated,
      unavailable: stats.unavailable,
    },
  });
}

function categoryNode(name, aggregate) {
  return node({
    id: `file-category-${name.toLowerCase()}`,
    label: name,
    type: 'file',
    value: aggregate.sizeBytes || aggregate.count || 1,
    sizeBytes: aggregate.sizeBytes,
    count: aggregate.count,
    status: statusForCount(aggregate.count, 300, 1200),
    updatedAt: aggregate.updatedAt,
    route: name === 'Code' ? 'projects' : 'files',
    meta: { category: name },
  });
}

function aggregateExtensionGroups(folderStats) {
  const groups = Object.fromEntries(
    Object.keys(EXT_GROUPS).map((name) => [
      name,
      {
        count: 0,
        sizeBytes: 0,
        updatedAt: '',
      },
    ]),
  );

  for (const stats of folderStats) {
    for (const [ext, count] of Object.entries(stats.byExt || {})) {
      for (const [name, exts] of Object.entries(EXT_GROUPS)) {
        if (!exts.has(ext)) continue;
        groups[name].count += count;
        if (stats.sizeBytes && stats.count) {
          groups[name].sizeBytes += Math.round(
            (stats.sizeBytes / Math.max(1, stats.count)) * count,
          );
        }
        if (
          stats.updatedAt &&
          (!groups[name].updatedAt ||
            Date.parse(stats.updatedAt) > Date.parse(groups[name].updatedAt))
        ) {
          groups[name].updatedAt = stats.updatedAt;
        }
      }
    }
  }
  return groups;
}

async function getFileCategoryStats(cleanup) {
  const folderDefs = dashboardFolderDefs();

  const folderStats = await Promise.all(
    folderDefs.map(([, label, folderPath]) => scanFolder(folderPath, label)),
  );
  const byKey = {};
  folderDefs.forEach(([key], index) => {
    byKey[key] = folderStats[index];
  });

  const extGroups = aggregateExtensionGroups(folderStats);
  const folderNodes = folderDefs.map(([key, , , route], index) =>
    fileNodeFromFolder(key, folderStats[index], route),
  );
  const categoryNodes = Object.entries(extGroups)
    .filter(([, stats]) => stats.count > 0)
    .map(([name, stats]) => categoryNode(name, stats));

  const tempSize = Number(cleanup?.tempSize || 0);
  const tempNode = node({
    id: 'cleanup-temp-files',
    label: 'Temp Files',
    type: 'cleanup',
    value: tempSize || 1,
    sizeBytes: tempSize,
    count: undefined,
    status: tempSize > 3 * 1024 ** 3 ? 'warning' : 'normal',
    updatedAt: cleanup?.lastScanTime || '',
    route: 'cleanup',
  });

  return {
    folders: byKey,
    extensionGroups: extGroups,
    nodes: [...folderNodes, ...categoryNodes, tempNode],
  };
}

async function getProjectStats(config) {
  try {
    const result = await projectService.listProjects(config);
    const projects = result.ok ? result.projects || [] : [];
    const recent = [...projects]
      .sort((a, b) => Date.parse(b.lastModified || 0) - Date.parse(a.lastModified || 0))
      .slice(0, 7);
    const nodes = recent.map((project) =>
      node({
        id: `project-${Buffer.from(project.path || project.name || '')
          .toString('base64')
          .slice(0, 18)}`,
        label: project.name || path.basename(project.path || 'Project'),
        type: 'project',
        value: project.totalFileCount || project.detectedFileCount || 1,
        count: project.totalFileCount || project.detectedFileCount || 0,
        sizeBytes: project.sizeBytes || undefined,
        status: project.hasGit || project.isGitRepo ? 'good' : 'normal',
        path: project.path,
        updatedAt: project.lastModified,
        route: 'projects',
        meta: {
          category: project.category,
          tags: project.tags || [],
          hasGit: !!(project.hasGit || project.isGitRepo),
          scanTruncated: !!project.scanTruncated,
        },
      }),
    );

    return {
      ok: true,
      projects,
      nodes,
      gitRepoCount: projects.filter((project) => project.hasGit || project.isGitRepo).length,
      activeProjectCount: projects.length,
      pinnedProjects: projectService.normalizeProjectHub(config).pinnedProjects || [],
      recentProjects: recent,
      scanStatus: result.scanStatus,
    };
  } catch (err) {
    const configured = Array.isArray(config.projects) ? config.projects : [];
    return {
      ok: false,
      error: err.message,
      projects: configured,
      nodes: configured.slice(0, 5).map((project) =>
        node({
          id: `project-config-${Buffer.from(project.path || project.name || '')
            .toString('base64')
            .slice(0, 18)}`,
          label: project.name || path.basename(project.path || 'Project'),
          type: 'project',
          value: 1,
          status: 'warning',
          path: project.path,
          route: 'projects',
          meta: { unavailable: true },
        }),
      ),
      gitRepoCount: 0,
      activeProjectCount: configured.length,
      pinnedProjects: projectService.normalizeProjectHub(config).pinnedProjects || [],
      recentProjects: configured,
      scanStatus: null,
    };
  }
}

function systemNodes(metrics, health, cleanup) {
  const disk = (metrics?.disks || []).find((item) => item.ok) || null;
  const recycle = cleanup?.recycleBin || {};
  const network = metrics?.network || {};
  return [
    node({
      id: 'system-cpu',
      label: 'CPU',
      type: 'system',
      value: metrics?.cpu?.usagePercent ?? 0,
      count: metrics?.cpu?.cores,
      status: statusForPercent(metrics?.cpu?.usagePercent),
      updatedAt: new Date().toISOString(),
      route: 'monitor',
    }),
    node({
      id: 'system-memory',
      label: 'Memory',
      type: 'system',
      value: metrics?.memory?.usagePercent ?? 0,
      sizeBytes: metrics?.memory?.usedBytes,
      status: statusForPercent(metrics?.memory?.usagePercent),
      updatedAt: new Date().toISOString(),
      route: 'monitor',
    }),
    node({
      id: 'system-storage',
      label: 'Storage',
      type: 'system',
      value: disk?.usedPercent ?? 0,
      sizeBytes: disk?.used,
      status: statusForDisk(disk),
      path: disk?.drive,
      updatedAt: new Date().toISOString(),
      route: 'monitor',
    }),
    node({
      id: 'system-network',
      label: 'Network',
      type: 'system',
      value: network.available ? network.totalMbps : 0,
      status: 'normal',
      updatedAt: new Date().toISOString(),
      route: 'monitor',
      meta: {
        unavailable: !network.available,
        unit: 'Mbps',
        rxMbps: network.rxMbps || 0,
        txMbps: network.txMbps || 0,
        warmedUp: network.warmedUp === true,
        reason: network.available ? '' : 'Network throughput is warming up.',
      },
    }),
    node({
      id: 'cleanup-cache',
      label: 'Cache',
      type: 'cleanup',
      value: 1,
      status: 'normal',
      updatedAt: cleanup?.lastScanTime || '',
      route: 'cleanup',
      meta: {
        unavailable: true,
        reason: 'Cache size is available after a Clean Center scan.',
      },
    }),
    node({
      id: 'cleanup-recycle-bin',
      label: 'Recycle Bin',
      type: 'cleanup',
      value: recycle.size || recycle.count || 1,
      sizeBytes: recycle.size || 0,
      count: recycle.count || 0,
      status: recycle.size > 2 * 1024 ** 3 ? 'warning' : 'normal',
      updatedAt: cleanup?.lastCleanupTime || '',
      route: 'cleanup',
    }),
    node({
      id: 'system-health',
      label: 'System Health',
      type: 'system',
      value: health?.score ?? 0,
      status:
        (health?.score ?? 0) >= 80 ? 'good' : (health?.score ?? 0) >= 60 ? 'warning' : 'danger',
      updatedAt: new Date().toISOString(),
      route: 'health',
    }),
  ];
}

function getAutomationNodes(config) {
  const rules = automationService.list(config);
  const enabled = rules.filter((rule) => rule && rule.enabled !== false);
  return {
    rules,
    nodes: [
      node({
        id: 'automation-rules',
        label: 'Automation Rules',
        type: 'automation',
        value: enabled.length || 1,
        count: enabled.length,
        status: enabled.length ? 'good' : 'normal',
        route: 'automations',
      }),
    ],
  };
}

function todayCount(rows) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return rows
    .filter((row) => {
      const date = new Date(row.time || row.at || 0);
      return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
    })
    .reduce((sum, row) => sum + Number(row.count || row.moved || 1), 0);
}

async function getDashboardStats(config) {
  const cleanup = await cleanupService
    .getStatus()
    .catch((err) => ({ ok: false, error: err.message }));
  const [metrics, activities, notifications] = await Promise.all([
    systemMonitorService.getMetrics({
      monitorDrives: config.general && config.general.monitorDrives,
      monitorDrive: config.general && config.general.monitorDrive,
    }),
    activityHistoryService
      .listHistory()
      .catch((err) => ({ ok: false, rows: [], error: err.message })),
    notificationService
      .listEvents()
      .catch((err) => ({ ok: false, events: [], unreadCount: 0, error: err.message })),
  ]);

  const fileStats = await getFileCategoryStats(cleanup);
  const projectStats = await getProjectStats(config);
  const downloadsCount = Number(fileStats.folders?.downloads?.count || 0);
  const health = systemMonitorService.computeHealthScore(metrics, {
    unsortedDownloads: downloadsCount,
    hasStaleProject: projectStats.projects.some(
      (project) => Number(project.hoursSinceCommit || 0) > 72,
    ),
  });
  const automation = getAutomationNodes(config);
  const organizedToday = todayCount(activities.rows || []);

  const organizedNode = node({
    id: 'activity-organized-today',
    label: 'Organized Today',
    type: 'automation',
    value: organizedToday || 1,
    count: organizedToday,
    status: organizedToday ? 'good' : 'normal',
    updatedAt: new Date().toISOString(),
    route: 'history',
  });

  const nodes = [
    ...fileStats.nodes,
    ...projectStats.nodes,
    ...systemNodes(metrics, health, cleanup),
    ...automation.nodes,
    organizedNode,
  ];
  const scope = await authorizationScope(config);
  await Promise.all(
    nodes
      .filter((dashboardNode) => dashboardNode.path)
      .map((dashboardNode) =>
        registerAuthorizedNode(dashboardNode.id, dashboardNode.path, config, undefined, scope),
      ),
  );

  const disk = (metrics.disks || []).find((item) => item.ok) || null;
  const totalFiles = Object.values(fileStats.folders).reduce(
    (sum, item) => sum + Number(item.count || 0),
    0,
  );
  const totalFileBytes = Object.values(fileStats.folders).reduce(
    (sum, item) => sum + Number(item.sizeBytes || 0),
    0,
  );

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stats: {
      totalFiles,
      totalFileBytes,
      activeProjects: projectStats.activeProjectCount,
      gitRepos: projectStats.gitRepoCount,
      storageUsedPercent: disk ? disk.usedPercent : null,
      storageUsedBytes: disk ? disk.used : null,
      cacheSizeBytes: null,
      tempSizeBytes: cleanup?.tempSize ?? null,
      systemHealth: health.score,
      organizedToday,
      automationRules: automation.rules.length,
      enabledAutomations: automation.rules.filter((rule) => rule && rule.enabled !== false).length,
    },
    system: {
      metrics,
      health,
      cleanup,
    },
    files: fileStats,
    projects: projectStats,
    automation: {
      rules: automation.rules,
    },
    activities: activities.rows || [],
    notifications: {
      events: notifications.events || [],
      unreadCount: notifications.unreadCount || 0,
    },
    nodes,
    unavailable: [
      ...(metrics.network?.available
        ? []
        : [
            {
              key: 'networkUsage',
              reason: 'Network throughput is warming up.',
            },
          ]),
      {
        key: 'cacheSize',
        reason:
          'Cache size is available after a Clean Center scan, but no standalone cached total is exposed yet.',
      },
    ],
  };
}

module.exports = {
  browseNode,
  getDashboardStats,
  getFileCategoryStats,
  getProjectStats,
  previewNode,
  resolveAuthorizedNode,
  searchFolderNodes,
  PREVIEW_ERRORS,
  PREVIEW_LIMITS,
  __testing: {
    authorizedNodeRegistry,
    registerAuthorizedNode,
    resetAuthorizedNodes: () => authorizedNodeRegistry.clear(),
    stableNodeId,
  },
};
