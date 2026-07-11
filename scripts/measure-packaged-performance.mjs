import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const executablePath = path.resolve(argument('executable'));
const outputPath = path.resolve(
  argument('output', path.join('test-results', 'packaged-performance.json')),
);
const durationSeconds = Math.max(30, Number(argument('duration-seconds', '900')) || 900);

if (!executablePath || !(await fs.stat(executablePath).catch(() => null))?.isFile()) {
  process.stderr.write('Pass an existing packaged executable with --executable=<path>.\n');
  process.exit(1);
}

function sanitize(message) {
  return String(message || '')
    .replace(/[A-Za-z]:\\[^\s"']+/g, '<local-path>')
    .slice(0, 400);
}

function aggregateAppMetrics(metrics) {
  const rows = (metrics || []).map((metric) => ({
    type: metric.type,
    workingSetKb: Number(metric.memory?.workingSetSize || 0),
    peakWorkingSetKb: Number(metric.memory?.peakWorkingSetSize || 0),
    privateKb: Number(metric.memory?.privateBytes || 0),
  }));
  return {
    totalWorkingSetKb: rows.reduce((sum, row) => sum + row.workingSetKb, 0),
    totalPrivateKb: rows.reduce((sum, row) => sum + row.privateKb, 0),
    processes: rows,
  };
}

const consoleMessages = [];
const pageErrors = [];
const interactionErrors = [];
const actions = {
  orbit: 0,
  zoom: 0,
  focus: 0,
  expand: 0,
  back: 0,
  search: 0,
  category: 0,
  pauseResume: 0,
  overview: 0,
};

const startedAt = new Date();
const electronApp = await electron.launch({
  executablePath,
  args: ['--performance-probe'],
  env: { ...process.env, PCLA_PERFORMANCE_PROBE: '1' },
  timeout: 60000,
});

let report;
try {
  await electronApp.firstWindow({ timeout: 60000 });
  let page = null;
  const windowDeadline = Date.now() + 60000;
  while (!page && Date.now() < windowDeadline) {
    for (const candidate of electronApp.windows()) {
      if ((await candidate.locator('[data-testid="dashboard-data-core"]').count()) > 0) {
        page = candidate;
        break;
      }
    }
    if (!page) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!page) throw new Error('The packaged Dashboard window did not become available.');
  await electronApp.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes('overlay=1'),
    );
    if (main) {
      main.setSize(1440, 900);
      main.center();
      main.setAlwaysOnTop(true, 'screen-saver');
      main.webContents.setBackgroundThrottling(false);
      main.show();
      main.focus();
    }
  });
  await page.bringToFront();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push({ type: message.type(), text: sanitize(message.text()) });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(sanitize(error.message)));

  await page.waitForLoadState('domcontentloaded');
  const core = page.locator('[data-testid="dashboard-data-core"]');
  await core.waitFor({ state: 'visible', timeout: 60000 });
  const activator = core.locator('.globe-core-activator');
  await activator.waitFor({ state: 'visible', timeout: 120000 });
  await activator.click();
  await core.waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="dashboard-data-core"]')?.getAttribute('data-state') ===
      'open',
    undefined,
    { timeout: 60000 },
  );

  await page.evaluate(() => {
    const probe = {
      frames: 0,
      startedAt: performance.now(),
      lastFrameAt: 0,
      intervals: [],
      longTasks: [],
      frameHandle: 0,
      observer: null,
    };
    const frame = (time) => {
      if (probe.lastFrameAt) probe.intervals.push(time - probe.lastFrameAt);
      probe.lastFrameAt = time;
      probe.frames += 1;
      probe.frameHandle = requestAnimationFrame(frame);
    };
    if ('PerformanceObserver' in window) {
      try {
        probe.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            probe.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        });
        probe.observer.observe({ type: 'longtask', buffered: true });
      } catch {
        probe.observer = null;
      }
    }
    probe.frameHandle = requestAnimationFrame(frame);
    window.__pclaPerformanceProbe = probe;
  });

  const startMetrics = aggregateAppMetrics(
    await electronApp.evaluate(({ app }) => app.getAppMetrics()),
  );
  const memorySamples = [{ elapsedSeconds: 0, ...startMetrics }];
  let lastMemorySampleAt = Date.now();
  const gpuFeatureStatus = await electronApp.evaluate(({ app }) => app.getGPUFeatureStatus());
  const environment = await page.evaluate(() => {
    const canvas = document.querySelector('.globe-webgl-canvas');
    const coreElement = document.querySelector('[data-testid="dashboard-data-core"]');
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      rendererPixelRatio: Number(canvas?.dataset.pixelRatio || 0),
      nodeCount: Number(coreElement?.getAttribute('data-node-count') || 0),
      assetState: coreElement?.getAttribute('data-asset-state') || '',
      backgroundThrottlingDisabledForProbe: true,
    };
  });

  const measurementStartedAt = Date.now();
  const deadline = measurementStartedAt + durationSeconds * 1000;
  let cycle = 0;
  while (Date.now() < deadline) {
    cycle += 1;
    try {
      await page.bringToFront();
      const coreState = await core.getAttribute('data-state');
      if (coreState === 'idle' && (await activator.isVisible().catch(() => false))) {
        await activator.click();
        await page.waitForTimeout(900);
      }

      const canvas = core.locator('canvas.globe-webgl-canvas');
      const box = await canvas.boundingBox({ timeout: 3000 });
      if (box) {
        const offset = cycle % 2 ? 0.62 : 0.38;
        await page.mouse.move(box.x + box.width * offset, box.y + box.height * 0.45);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * (1 - offset), box.y + box.height * 0.52, {
          steps: 8,
        });
        await page.mouse.up();
        actions.orbit += 1;
        await page.mouse.wheel(0, cycle % 2 ? -180 : 180);
        actions.zoom += 1;
      }

      const groupTabs = page.locator('.globe-group-tabs button');
      const groupCount = await groupTabs.count();
      if (groupCount) {
        await groupTabs.nth(cycle % groupCount).click();
        actions.category += 1;
      }

      const nodes = page.locator('.globe-node-list > button');
      const nodeCount = await nodes.count();
      if (nodeCount) {
        await nodes.nth(cycle % nodeCount).click();
        actions.focus += 1;
      }

      if (cycle % 10 === 0) {
        const search = page.locator('#globe-node-search-input');
        if (await search.isVisible().catch(() => false)) {
          await search.fill('Downloads');
          await page.waitForTimeout(350);
          await search.fill('');
          actions.search += 1;
        }
      }

      if (cycle % 15 === 0) {
        if (groupCount) await groupTabs.first().click();
        const folderNodes = page.locator('.globe-node-list > button');
        if ((await folderNodes.count()) > 0) await folderNodes.first().click();
        const explore = page.locator('.globe-explore-button');
        if (await explore.isVisible().catch(() => false)) {
          await explore.click();
          await page.waitForTimeout(500);
          actions.expand += 1;
        }
      } else if (cycle % 15 === 1) {
        const breadcrumbs = page.locator('.globe-spatial-breadcrumbs');
        if (await breadcrumbs.isVisible().catch(() => false)) {
          await page.locator('.globe-core-controls button').first().click();
          actions.back += 1;
        }
      }

      if (cycle % 12 === 0) {
        const motion = page.locator('.globe-core-controls button[aria-pressed]');
        if (await motion.isVisible().catch(() => false)) {
          await motion.click();
          await page.waitForTimeout(250);
          await motion.click();
          actions.pauseResume += 1;
        }
      }

      if (cycle % 24 === 0) {
        const close = page.locator('.core-close-button');
        if (await close.isVisible().catch(() => false)) {
          await close.click();
          actions.overview += 1;
          await page.waitForTimeout(1000);
        }
      }
    } catch (error) {
      interactionErrors.push(sanitize(error.message));
    }
    if (Date.now() - lastMemorySampleAt >= 60000) {
      const sample = aggregateAppMetrics(
        await electronApp.evaluate(({ app }) => app.getAppMetrics()),
      );
      memorySamples.push({
        elapsedSeconds: (Date.now() - measurementStartedAt) / 1000,
        ...sample,
      });
      lastMemorySampleAt = Date.now();
    }
    await page.waitForTimeout(4000);
  }

  const frameResults = await page.evaluate(() => {
    const probe = window.__pclaPerformanceProbe;
    cancelAnimationFrame(probe.frameHandle);
    probe.observer?.disconnect();
    const intervals = probe.intervals.filter((value) => Number.isFinite(value) && value > 0);
    const sorted = [...intervals].sort((a, b) => a - b);
    const percentile = (value) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
    const elapsedMs = Math.max(1, probe.lastFrameAt - probe.startedAt);
    const mean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length);
    const variance =
      intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      Math.max(1, intervals.length);
    const resourceEntries = performance.getEntriesByType('resource');
    return {
      frames: probe.frames,
      elapsedMs,
      averageFps: (probe.frames * 1000) / elapsedMs,
      onePercentLowFps: percentile(0.99) ? 1000 / percentile(0.99) : 0,
      lowestObservedFps: sorted.at(-1) ? 1000 / sorted.at(-1) : 0,
      meanFrameTimeMs: mean,
      p95FrameTimeMs: percentile(0.95),
      p99FrameTimeMs: percentile(0.99),
      maxFrameTimeMs: sorted.at(-1) || 0,
      frameTimeStdDevMs: Math.sqrt(variance),
      framesOver50Ms: intervals.filter((value) => value > 50).length,
      multiSecondFreezes: intervals.filter((value) => value > 2000).length,
      longTaskCount: probe.longTasks.length,
      longestTaskMs: Math.max(0, ...probe.longTasks.map((task) => task.duration)),
      glbResourceLoads: resourceEntries.filter((entry) => entry.name.includes('.glb')).length,
    };
  });
  const endMetrics = aggregateAppMetrics(
    await electronApp.evaluate(({ app }) => app.getAppMetrics()),
  );
  const finalScene = await page.evaluate(() => {
    const canvas = document.querySelector('.globe-webgl-canvas');
    return {
      drawCalls: Number(canvas?.dataset.drawCalls || 0),
      triangles: Number(canvas?.dataset.triangles || 0),
      pixelRatio: Number(canvas?.dataset.pixelRatio || 0),
    };
  });

  report = {
    schemaVersion: 1,
    measuredAt: startedAt.toISOString(),
    application: {
      executable: path.basename(executablePath),
      version: await electronApp.evaluate(({ app }) => app.getVersion()),
      packaged: await electronApp.evaluate(({ app }) => app.isPackaged),
      electron: await electronApp.evaluate(() => process.versions.electron),
      platform: `${process.platform}-${process.arch}`,
    },
    environment: {
      ...environment,
      qualityMode: environment.width < 760 ? 'compact adaptive DPR' : 'desktop adaptive DPR',
      gpuFeatureStatus,
    },
    duration: {
      requestedSeconds: durationSeconds,
      measuredSeconds: frameResults.elapsedMs / 1000,
    },
    frames: frameResults,
    memory: {
      start: startMetrics,
      end: endMetrics,
      workingSetGrowthKb: endMetrics.totalWorkingSetKb - startMetrics.totalWorkingSetKb,
      privateGrowthKb: endMetrics.totalPrivateKb - startMetrics.totalPrivateKb,
      samples: memorySamples,
    },
    scene: finalScene,
    interactions: actions,
    diagnostics: {
      consoleMessages,
      pageErrors,
      interactionErrors,
    },
  };
} finally {
  await electronApp.close().catch(() => {});
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`Packaged performance report written to ${outputPath}\n`);
/* global cancelAnimationFrame, document, PerformanceObserver, performance, requestAnimationFrame, setTimeout, window */
