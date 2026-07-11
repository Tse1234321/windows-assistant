import { expect, test, type Page } from '@playwright/test';

const dashboardNodes = [
  {
    id: 'file-downloads',
    label: 'Downloads',
    type: 'file',
    value: 42,
    count: 42,
    sizeBytes: 4096,
    status: 'warning',
    path: 'C:\\Users\\User\\Downloads',
    updatedAt: '2026-07-10T03:00:00.000Z',
    route: 'files',
    meta: {},
  },
  {
    id: 'project-nexus',
    label: 'NEXUS',
    type: 'project',
    value: 18,
    count: 18,
    status: 'good',
    path: 'C:\\Projects\\NEXUS',
    updatedAt: '2026-07-10T02:00:00.000Z',
    route: 'projects',
    meta: { hasGit: true },
  },
  {
    id: 'system-cpu',
    label: 'CPU',
    type: 'system',
    value: 38,
    status: 'normal',
    updatedAt: '2026-07-10T03:00:00.000Z',
    route: 'monitor',
    meta: {},
  },
  {
    id: 'cleanup-temp-files',
    label: 'Temp Files',
    type: 'cleanup',
    value: 1024,
    sizeBytes: 1024,
    status: 'normal',
    updatedAt: '2026-07-10T03:00:00.000Z',
    route: 'cleanup',
    meta: {},
  },
  {
    id: 'automation-rules',
    label: 'Automation Rules',
    type: 'automation',
    value: 3,
    count: 3,
    status: 'good',
    route: 'automations',
    meta: {},
  },
];

async function mockDashboardApi(
  page: Page,
  disableWebGl = false,
  nodes = dashboardNodes,
  browseResult = {
    ok: true,
    folders: [],
    files: [{ name: 'notes.md', path: 'C:\\Users\\User\\Downloads\\notes.md', ext: '.md' }],
    truncated: false,
  },
) {
  await page.addInitScript(
    ({ nodes, noWebGl, browseResult }) => {
      if (noWebGl) {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function getContext(
          contextId: string,
          ...args: unknown[]
        ) {
          if (contextId === 'webgl' || contextId === 'webgl2') return null;
          return originalGetContext.call(this, contextId as '2d', ...args);
        } as typeof originalGetContext;
      }

      const noopUnsub = () => () => {};
      const overrides: Record<string, unknown> = {
        onNavigate: noopUnsub,
        onModeResult: noopUnsub,
        onOpenCommandPalette: noopUnsub,
        getSetupStatus: async () => ({ ok: true, complete: true }),
        getSettings: async () => ({
          ok: true,
          settings: { general: { language: 'en', dashboardRefreshIntervalSeconds: 60 } },
        }),
        getDashboardStats: async () => ({
          ok: true,
          generatedAt: '2026-07-10T03:00:00.000Z',
          stats: {
            totalFiles: 42,
            totalFileBytes: 4096,
            storageUsedPercent: 51,
            systemHealth: 88,
            organizedToday: 4,
          },
          system: {
            metrics: {
              cpu: { usagePercent: 38, cores: 8 },
              memory: { usagePercent: 54, usedBytes: 4096, totalBytes: 8192 },
              disks: [],
              network: { available: true, totalMbps: 12 },
            },
            health: { score: 88 },
            cleanup: {},
          },
          files: { folders: {}, extensionGroups: {}, nodes: [] },
          projects: { projects: [], pinnedProjects: [], recentProjects: [] },
          notifications: { events: [], unreadCount: 0 },
          activities: [],
          unavailable: [],
          nodes,
        }),
        searchDashboardFolders: async () => ({ ok: true, nodes: [] }),
        browseDashboardNode: async () => browseResult,
        previewDashboardNode: async ({ nodeId }: { nodeId: string }) => {
          const delay = nodeId === 'file-slow' ? 160 : 10;
          await new Promise((resolve) => window.setTimeout(resolve, delay));
          return {
            ok: true,
            code: 'ok',
            nodeId,
            kind: 'text',
            encoding: 'utf-8',
            content: `preview:${nodeId}`,
            truncated: false,
            meta: {
              nodeId,
              name: `${nodeId}.txt`,
              extension: '.txt',
              mimeType: 'text/plain',
              sizeBytes: 16,
              updatedAt: '2026-07-10T03:00:00.000Z',
            },
          };
        },
        revealDashboardNode: async ({ nodeId }: { nodeId: string }) => {
          (window as unknown as { __revealedNodeId?: string }).__revealedNodeId = nodeId;
          return { ok: true, nodeId };
        },
        openPath: async () => ({ ok: true }),
      };
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(target, prop: string) {
          if (prop in target) return target[prop];
          const fn = () => Promise.resolve({ ok: true });
          return new Proxy(fn, handler as ProxyHandler<typeof fn>);
        },
      };
      (window as unknown as { api: unknown }).api = new Proxy(overrides, handler);
    },
    { nodes, noWebGl: disableWebGl, browseResult },
  );
}

test('opens the core, selects a real node, and returns to overview', async ({ page }, testInfo) => {
  testInfo.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('Too many active WebGL contexts'))
      browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await mockDashboardApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const core = page.getByTestId('dashboard-data-core');
  await expect(core).toHaveAttribute('data-state', 'idle');
  const openButton = page.getByRole('button', { name: 'Open data core' });
  await openButton.hover();
  if (process.env.CAPTURE_DASHBOARD)
    await core.screenshot({ path: 'test-results/data-core-idle.png' });
  await openButton.dblclick();
  await expect(core).toHaveAttribute('data-state', 'open', { timeout: 20_000 });
  await expect(core).toHaveClass(/globe-fullscreen/);
  await expect(core.locator('.globe-data-tree-group')).toHaveCount(5);
  const fullscreenBox = await core.boundingBox();
  expect(fullscreenBox).not.toBeNull();
  expect(fullscreenBox?.x).toBeLessThanOrEqual(1);
  expect(fullscreenBox?.y).toBeLessThanOrEqual(1);
  expect(fullscreenBox?.width).toBeGreaterThanOrEqual(1438);
  expect(fullscreenBox?.height).toBeGreaterThanOrEqual(898);
  const fullscreenCanvas = core.locator('canvas.globe-webgl-canvas');
  await expect(fullscreenCanvas).toBeVisible();
  const canvasBox = await fullscreenCanvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThanOrEqual(1438);
  expect(canvasBox?.height).toBeGreaterThanOrEqual(898);
  if (process.env.CAPTURE_DASHBOARD)
    await core.screenshot({ path: 'test-results/data-core-expanded.png' });

  await expect(page.getByRole('tab', { name: 'Files 1' })).toBeVisible();
  const search = page.getByPlaceholder('Search files, folders, or projects…');
  await search.fill('NEXUS');
  await expect(page.getByRole('option', { name: 'NEXUS C:\\Projects\\NEXUS Good' })).toBeVisible();
  await search.press('Enter');
  await expect(page.getByRole('complementary', { name: 'NEXUS' })).toBeVisible();
  await page.getByRole('button', { name: 'Close node details' }).click();
  await search.fill('');
  await page.getByRole('tab', { name: 'Files 1' }).click();
  await page.getByRole('button', { name: 'Downloads 42 files / 4 KB' }).click();
  await expect(page.getByRole('complementary', { name: 'Downloads' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Downloads' })).toContainText('notes.md');
  if (process.env.CAPTURE_DASHBOARD)
    await core.screenshot({ path: 'test-results/data-core-selected.png' });

  await page.getByRole('button', { name: 'Close node details' }).click();
  await page.getByRole('button', { name: 'Return to overview' }).click();
  await expect(core).toHaveAttribute('data-state', 'idle', { timeout: 20_000 });
  await expect(core).not.toHaveClass(/globe-fullscreen/);
  await openButton.dblclick();
  await expect(core).toHaveAttribute('data-state', 'open', { timeout: 20_000 });
  await expect(core.locator('canvas.globe-webgl-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Return to overview' }).click();
  await expect(core).toHaveAttribute('data-state', 'idle', { timeout: 20_000 });
  expect(browserErrors).toEqual([]);
});

test('loads the GLB kit, explores a dense real folder cluster, and keeps camera controls bounded', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const browseResult = {
    ok: true,
    folders: Array.from({ length: 12 }, (_, index) => ({
      name: `Folder ${index + 1}`,
      path: `C:\\Users\\User\\Downloads\\Folder-${index + 1}`,
      itemCount: index + 2,
      updatedAt: '2026-07-10T03:00:00.000Z',
    })),
    files: Array.from({ length: 24 }, (_, index) => ({
      name: `document-${index + 1}.txt`,
      path: `C:\\Users\\User\\Downloads\\document-${index + 1}.txt`,
      sizeBytes: 1024 + index,
      ext: '.txt',
      updatedAt: '2026-07-10T03:00:00.000Z',
    })),
    truncated: false,
  };
  await mockDashboardApi(page, false, dashboardNodes, browseResult);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const core = page.getByTestId('dashboard-data-core');
  await page.getByRole('button', { name: 'Open data core' }).click();
  await expect(core).toHaveAttribute('data-state', 'open', { timeout: 20_000 });
  await expect(core).toHaveAttribute('data-asset-state', 'loaded', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Downloads 42 files / 4 KB' }).click();

  const canvas = core.locator('canvas.globe-webgl-canvas');
  await expect(canvas).toHaveAttribute('data-focused-node', 'file-downloads', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Explore contents in 3D' }).click();
  await expect(core).toHaveAttribute('data-node-count', '36');
  await expect(page.getByRole('navigation', { name: 'Spatial folder path' })).toContainText(
    'Downloads',
  );
  await expect(page.getByRole('tab', { name: 'Files 36' })).toBeVisible();
  if (process.env.CAPTURE_DASHBOARD) {
    await core.screenshot({ path: 'test-results/data-universe-1920x1080.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await core.screenshot({ path: 'test-results/data-universe-1440x900.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await core.screenshot({ path: 'test-results/data-universe-390x844.png' });
    await page.setViewportSize({ width: 1920, height: 1080 });
  }

  const pixelRatio = Number(await canvas.getAttribute('data-pixel-ratio'));
  const triangles = Number(await canvas.getAttribute('data-triangles'));
  expect(pixelRatio).toBeLessThanOrEqual(1.6);
  expect(triangles).toBeLessThan(200_000);

  const beforeZoom = Number(await canvas.getAttribute('data-camera-distance'));
  await canvas.hover();
  await page.mouse.wheel(0, -420);
  await page.waitForTimeout(350);
  const afterZoom = Number(await canvas.getAttribute('data-camera-distance'));
  expect(afterZoom).toBeLessThan(beforeZoom);
  expect(afterZoom).toBeGreaterThanOrEqual(4.4);

  await page.getByRole('button', { name: 'Back one level' }).click();
  await expect(core).toHaveAttribute('data-node-count', '5');
});

test('previews indexed file content, ignores stale responses, and preserves secure reveal', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const browseResult = {
    ok: true,
    folders: [],
    files: [
      {
        id: 'file-slow',
        name: 'slow.txt',
        path: 'C:\\Users\\User\\Downloads\\slow.txt',
        sizeBytes: 16,
        ext: '.txt',
      },
      {
        id: 'file-fast',
        name: 'fast.txt',
        path: 'C:\\Users\\User\\Downloads\\fast.txt',
        sizeBytes: 16,
        ext: '.txt',
      },
    ],
    truncated: false,
  };
  await mockDashboardApi(page, false, dashboardNodes, browseResult);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open data core' }).click();
  await page.getByRole('button', { name: 'Downloads 42 files / 4 KB' }).click();
  await page.getByRole('button', { name: 'Explore contents in 3D' }).click();

  // Scope to the directory panel: featured files also appear as callout cards.
  const directory = page.locator('#globe-data-directory');
  await directory.getByRole('button', { name: /slow\.txt/ }).click();
  await directory.getByRole('button', { name: /fast\.txt/ }).click();
  const preview = page.locator('.globe-file-preview');
  await expect(preview).toHaveAttribute('data-preview-state', 'ready');
  await expect(preview.locator('pre')).toHaveText('preview:file-fast');
  await page.waitForTimeout(220);
  await expect(preview.locator('pre')).toHaveText('preview:file-fast');

  await preview.getByRole('button', { name: 'Reveal file' }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { __revealedNodeId?: string }).__revealedNodeId,
    ),
  ).toBe('file-fast');
});

test('supports keyboard activation, escape, reduced motion, and a 360px layout', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await mockDashboardApi(page);
  await page.goto('/');

  const core = page.getByTestId('dashboard-data-core');
  const openButton = page.getByRole('button', { name: 'Open data core' });
  await openButton.focus();
  await openButton.press('Enter');
  await expect(core).toHaveAttribute('data-state', 'open');
  await expect(page.getByRole('button', { name: 'Resume motion' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (process.env.CAPTURE_DASHBOARD)
    await core.screenshot({ path: 'test-results/data-core-mobile.png' });

  await page.keyboard.press('Escape');
  await expect(core).toHaveAttribute('data-state', 'idle');
});

test('keeps the data structure stable across desktop, laptop, and tablet resizing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockDashboardApi(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open data core' }).click();

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('dashboard-data-core')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Files 1' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test('keeps the categorized directory usable without WebGL', async ({ page }) => {
  await mockDashboardApi(page, true);
  await page.goto('/');

  await expect(page.getByText('3D rendering is unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Open data core' }).click();
  await expect(page.getByRole('tab', { name: 'Projects 1' })).toBeVisible();
  await page.getByRole('tab', { name: 'Projects 1' }).click();
  await expect(page.getByRole('button', { name: 'NEXUS 18 files' })).toBeVisible();
});

test('keeps the procedural scene usable when the GLB asset fails to load', async ({ page }) => {
  await page.route('**/*.glb', (route) => route.abort());
  await mockDashboardApi(page);
  await page.goto('/');
  const core = page.getByTestId('dashboard-data-core');
  await page.getByRole('button', { name: 'Open data core' }).click();
  await expect(core).toHaveAttribute('data-asset-state', 'fallback', { timeout: 20_000 });
  await expect(core.locator('canvas.globe-webgl-canvas')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Files 1' })).toBeVisible();
});

test('shows a controlled empty state when no live nodes are available', async ({ page }) => {
  await mockDashboardApi(page, false, []);
  await page.goto('/');

  await expect(page.getByTestId('dashboard-data-core')).toBeVisible();
  await expect(page.getByText('No live nodes available')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open data core' })).toHaveCount(0);
});

test('keeps opening and closing transitions cancel-safe', async ({ page }) => {
  await mockDashboardApi(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const core = page.getByTestId('dashboard-data-core');
  const openButton = page.getByRole('button', { name: 'Open data core' });
  await openButton.click();
  await expect(core).toHaveAttribute('data-state', /opening|open/);

  // Closing during the reveal must settle back to idle and must not leave a
  // stale open timer that reopens the core afterwards.
  await page.getByRole('button', { name: 'Return to overview' }).click();
  await expect(core).toHaveAttribute('data-state', /closing|idle/);
  await expect(core).toHaveAttribute('data-state', 'idle', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Open data core' })).toBeVisible();
});
