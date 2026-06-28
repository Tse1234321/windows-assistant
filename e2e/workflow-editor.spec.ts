import { expect, test, type Page } from '@playwright/test';

/**
 * Drives the visual workflow editor against the built renderer. `window.api`
 * is mocked before the app boots, so this validates navigation, templates,
 * palette creation, and dry-run UI independently of the Electron backend.
 */

async function mockApi(page: Page) {
  await page.addInitScript(() => {
    const noopUnsub = () => () => {};
    const overrides: Record<string, unknown> = {
      onNavigate: noopUnsub,
      onModeResult: noopUnsub,
      onOpenCommandPalette: noopUnsub,
      onFileEvent: noopUnsub,
      onAutomationFired: noopUnsub,
      getSetupStatus: async () => ({ ok: true, complete: true }),
      getSettings: async () => ({ ok: true, settings: { general: { language: 'en' } } }),
      getDashboardStats: async () => ({ ok: true, stats: {}, nodes: [] }),
      getSystemStatus: async () => ({ ok: true }),
      pickPath: async () => ({ ok: true, path: 'C:\\Users\\jerem\\Downloads' }),
      workflows: {
        list: async () => ({ ok: true, workflows: [] }),
        save: async () => ({ ok: true }),
        setEnabled: async () => ({ ok: true }),
        dryRun: async () => ({
          ok: true,
          dryRun: true,
          steps: [{ nodeId: 'a1', type: 'organizeFileByType', destructive: true, dryRun: true }],
        }),
        run: async () => ({
          ok: true,
          steps: [{ nodeId: 'a1', type: 'organizeFileByType', ok: true }],
        }),
      },
    };

    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        const fn = () => Promise.resolve({ ok: true });
        return new Proxy(fn, handler as ProxyHandler<typeof fn>);
      },
    };
    (window as unknown as { api: unknown }).api = new Proxy(overrides, handler);
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
});

test('navigates to the visual automation editor', async ({ page }) => {
  await page.getByText('Workflows', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visual Automation' })).toBeVisible();
});

test('create a workflow, apply a template, and preview a dry-run', async ({ page }) => {
  await page.getByText('Workflows', { exact: true }).click();

  await page.getByTestId('wf-new').click();
  await expect(page.getByTestId('wf-list-item')).toHaveCount(1);

  await page.getByTestId('wf-template-Tidy Downloads').click();
  await expect(page.locator('.wf-node')).toHaveCount(2);
  await expect(page.locator('.wf-node-danger')).toHaveCount(1);

  await page.getByRole('button', { name: 'Dry run' }).click();
  const output = page.getByTestId('wf-run-output');
  await expect(output).toContainText('DRY');
  await expect(output).toContainText('Organize file');
});

test('add a trigger node from the node palette', async ({ page }) => {
  await page.getByText('Workflows', { exact: true }).click();
  await page.getByTestId('wf-new').click();
  await page.getByTestId('wf-add-node').click();
  await page.getByTestId('wf-palette-trigger-newFileInFolder').click();
  await expect(page.locator('.wf-node-trigger')).toHaveCount(1);
});
