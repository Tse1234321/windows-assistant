# Packaged Dashboard performance validation

`scripts/measure-packaged-performance.mjs` launches an unpacked packaged executable through Playwright's Electron driver. It is not shipped in the application and does not activate during normal production use.

## Build and run

Build the unpacked application into a temporary directory, stop any already-running PC Life Assistant instance so the single-instance lock cannot redirect the probe, then run:

```powershell
npm run perf:packaged -- `
  --executable="<absolute-path-to-win-unpacked>\PC Life Assistant.exe" `
  --duration-seconds=900 `
  --output="test-results\packaged-performance.json"
```

The duration is clamped to at least 30 seconds; release verification uses at least 900 seconds. `test-results/` is ignored by Git.

## What the probe exercises

During the measurement the driver repeatedly performs canvas drag/orbit, wheel zoom, category selection, DOM node selection and camera focus, search, folder expansion, Back, pause/resume, and return-to-overview/reopen cycles. The scene is not left idle for the measurement.

## Recorded data

- rAF average FPS, 1% low FPS, lowest observed FPS, mean/p95/p99/max frame time, standard deviation, frames over 50 ms, and multi-second freezes;
- PerformanceObserver long-task count and longest duration when supported;
- Electron `app.getAppMetrics()` working-set/private memory at the beginning and end;
- renderer draw calls, triangles, DPR, viewport, node count, asset state, and GLB resource load count;
- sanitized console warnings/errors, page errors, interaction errors, and per-action counts;
- Electron GPU feature status.

The report removes path-like console fragments and does not contain file contents, node labels, search results, or local absolute paths. Performance numbers apply only to the recorded machine/build/window/quality state and must not be generalized without a new measurement.
