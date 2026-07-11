import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import dashboardService from './dashboardService.js';

const { browseNode, previewNode, PREVIEW_ERRORS, PREVIEW_LIMITS, __testing } = dashboardService;

describe('secure dashboard preview', () => {
  let workspace;
  let outside;
  let config;

  beforeEach(async () => {
    workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pcla-preview-workspace-'));
    outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pcla-preview-outside-'));
    config = {
      projectHub: {
        scanRoots: [workspace],
        excludeFolders: [],
        maxDepth: 2,
        pinnedProjects: [],
      },
      projects: [],
    };
    __testing.resetAuthorizedNodes();
    expect(
      await __testing.registerAuthorizedNode('workspace-root', workspace, config, 'folder'),
    ).toBe(true);
  });

  afterEach(async () => {
    __testing.resetAuthorizedNodes();
    await fs.promises.rm(workspace, { recursive: true, force: true });
    await fs.promises.rm(outside, { recursive: true, force: true });
  });

  async function indexFile(name, content) {
    const filePath = path.join(workspace, name);
    await fs.promises.writeFile(filePath, content);
    const result = await browseNode({ nodeId: 'workspace-root' }, config);
    expect(result.ok).toBe(true);
    const indexed = result.files.find((file) => file.name === name);
    expect(indexed?.id).toBeTruthy();
    return { filePath, indexed };
  }

  it('previews an indexed UTF-8 text file with the matching node ID', async () => {
    const { indexed } = await indexFile('notes.md', '# Safe preview\nhello');
    const result = await previewNode({ nodeId: indexed.id }, config);
    expect(result).toMatchObject({
      ok: true,
      nodeId: indexed.id,
      kind: 'text',
      encoding: 'utf-8',
      content: '# Safe preview\nhello',
      truncated: false,
    });
    expect(result.meta).not.toHaveProperty('path');
  });

  it('rejects path traversal and path-only requests before filesystem access', async () => {
    expect(await previewNode({ nodeId: '../outside' }, config)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.invalidRequest,
    });
    expect(await previewNode({ path: path.join(outside, 'secret.txt') }, config)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.invalidRequest,
    });
  });

  it('rejects an indexed node when its authorization root is removed', async () => {
    const { indexed } = await indexFile('authorized.txt', 'content');
    const differentConfig = {
      projectHub: { scanRoots: [outside], pinnedProjects: [], excludeFolders: [], maxDepth: 1 },
      projects: [],
    };
    expect(await previewNode({ nodeId: indexed.id }, differentConfig)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.outsideAuthorizedRoot,
    });
  });

  it('does not index a symbolic-link escape', async () => {
    const linkPath = path.join(workspace, 'outside-link');
    await fs.promises.symlink(outside, linkPath, 'junction');
    expect(await __testing.registerAuthorizedNode('symlink-node', linkPath, config, 'folder')).toBe(
      false,
    );
    expect(await previewNode({ nodeId: 'symlink-node' }, config)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.invalidNode,
    });
  });

  it('does not preview a directory as a file', async () => {
    expect(await previewNode({ nodeId: 'workspace-root' }, config)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.notFile,
    });
  });

  it('returns metadata-only fallback for unsupported extensions', async () => {
    const { indexed } = await indexFile('archive.exe', Buffer.from([77, 90, 0, 1]));
    const result = await previewNode({ nodeId: indexed.id }, config);
    expect(result).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.unsupportedType,
      nodeId: indexed.id,
      meta: { name: 'archive.exe', extension: '.exe', sizeBytes: 4 },
    });
    expect(result).not.toHaveProperty('content');
  });

  it('bounds oversized text by bytes, characters, and lines', async () => {
    const oversized = `${'line\n'.repeat(PREVIEW_LIMITS.maxReturnedLines + 20)}${'x'.repeat(
      PREVIEW_LIMITS.maxTextReadBytes,
    )}`;
    const { indexed } = await indexFile('large.log', oversized);
    const result = await previewNode({ nodeId: indexed.id }, config);
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(
      PREVIEW_LIMITS.maxTextReadBytes,
    );
    expect(result.content.split('\n').length).toBeLessThanOrEqual(PREVIEW_LIMITS.maxReturnedLines);
  });

  it('does not return binary data as raw text', async () => {
    const { indexed } = await indexFile('binary.txt', Buffer.from([0, 1, 2, 3, 255]));
    expect(await previewNode({ nodeId: indexed.id }, config)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.binary,
    });
  });

  it('returns a stable missing-file error after an indexed file is removed', async () => {
    const { filePath, indexed } = await indexFile('gone.txt', 'temporary');
    await fs.promises.unlink(filePath);
    expect(await previewNode({ nodeId: indexed.id }, config)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.notFound,
    });
  });

  it('rejects a well-formed but unknown node ID', async () => {
    expect(await previewNode({ nodeId: 'unknown-node' }, config)).toMatchObject({
      ok: false,
      code: PREVIEW_ERRORS.invalidNode,
    });
  });

  it('returns a bounded allowlisted image data URL', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const { indexed } = await indexFile('pixel.png', png);
    const result = await previewNode({ nodeId: indexed.id }, config);
    expect(result).toMatchObject({ ok: true, kind: 'image', nodeId: indexed.id });
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('does not allow a renderer-supplied path to override an indexed node', async () => {
    const { indexed } = await indexFile('inside.txt', 'inside');
    const outsideFile = path.join(outside, 'secret.txt');
    await fs.promises.writeFile(outsideFile, 'secret');
    const result = await previewNode({ nodeId: indexed.id, path: outsideFile }, config);
    expect(result).toMatchObject({ ok: true, content: 'inside', nodeId: indexed.id });
    expect(result.content).not.toContain('secret');
  });
});
