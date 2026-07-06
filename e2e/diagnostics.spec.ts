import { expect, test, type Page } from '@playwright/test';

/**
 * Drives Settings → 診斷/修復 against the built renderer with a mocked
 * `window.api`: verifies the panel renders its status rows and that the
 * "匯出診斷包" button surfaces both the success path (toast + reveal) and a
 * failure path (readable error toast, no crash).
 */

async function mockApi(page: Page, exportResult: Record<string, unknown>) {
  await page.addInitScript((exportRes) => {
    const noopUnsub = () => () => {};
    const overrides: Record<string, unknown> = {
      onNavigate: noopUnsub,
      onModeResult: noopUnsub,
      onOpenCommandPalette: noopUnsub,
      onFileEvent: noopUnsub,
      onAutomationFired: noopUnsub,
      getSetupStatus: async () => ({ ok: true, complete: true }),
      getSettings: async () => ({
        ok: true,
        path: 'C:\\fake\\user-settings.json',
        settings: { general: { language: 'zh' } },
      }),
      getDashboardStats: async () => ({ ok: true, stats: {}, nodes: [] }),
      getSystemStatus: async () => ({ ok: true }),
      getDiagnostics: async () => ({
        ok: true,
        appVersion: '2.5.6',
        settingsPath: 'C:\\fake\\user-settings.json',
        storage: { ok: true },
        workflows: { total: 2, enabled: 1 },
        automations: { total: 3, enabled: 2 },
        lastWorkflowRunAt: Date.now(),
        scheduler: { automationTimer: true, workflowTimer: true, cleanupTimer: true },
        watcher: { enabled: true, paused: false, watched: 4 },
      }),
      exportDiagnostics: async () => exportRes,
      revealPath: async () => ({ ok: true }),
    };

    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        const fn = () => Promise.resolve({ ok: true });
        return new Proxy(fn, handler as ProxyHandler<typeof fn>);
      },
    };
    (window as unknown as { api: unknown }).api = new Proxy(overrides, handler);
  }, exportResult);
}

async function openDiagnostics(page: Page) {
  await page.goto('/');
  await page.getByText('設定', { exact: true }).click();
  await page.getByRole('button', { name: /診斷\/修復/ }).click();
  await expect(page.getByText('App 版本', { exact: true })).toBeVisible();
}

test('diagnostics panel renders status rows', async ({ page }) => {
  await mockApi(page, { ok: true, path: 'C:\\out\\nexus-diagnostics-20260706-120000.json' });
  await openDiagnostics(page);
  await expect(page.getByText('v2.5.6')).toBeVisible();
  await expect(page.getByText(/2 個，啟用 1 個/)).toBeVisible();
  await expect(page.getByText(/3 個，啟用 2 個/)).toBeVisible();
  await expect(page.getByRole('button', { name: '匯出診斷包' })).toBeVisible();
});

test('export success shows a toast with the file path', async ({ page }) => {
  await mockApi(page, { ok: true, path: 'C:\\out\\nexus-diagnostics-20260706-120000.json' });
  await openDiagnostics(page);
  await page.getByRole('button', { name: '匯出診斷包' }).click();
  await expect(page.locator('.toast-item')).toContainText('診斷包已匯出');
  await expect(page.locator('.toast-item')).toContainText('nexus-diagnostics-20260706-120000.json');
});

test('export failure shows a readable error toast', async ({ page }) => {
  await mockApi(page, { ok: false, error: '磁碟已滿，無法寫入診斷包' });
  await openDiagnostics(page);
  await page.getByRole('button', { name: '匯出診斷包' }).click();
  await expect(page.locator('.toast-item.error')).toContainText('磁碟已滿');
});

test('export cancel shows no error', async ({ page }) => {
  await mockApi(page, { ok: false, canceled: true });
  await openDiagnostics(page);
  await page.getByRole('button', { name: '匯出診斷包' }).click();
  await expect(page.locator('.toast-item')).toHaveCount(0);
});
