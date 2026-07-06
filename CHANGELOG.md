# Changelog

## 2.5.6 — Diagnostics bundle export (2026-07-06)

Final stable-release follow-up: one new, self-contained tool — no external
APIs, no paid services, no changes to existing data formats.

### New: one-click diagnostics bundle (Settings → 診斷/修復 → 匯出診斷包)

- Exports a single `nexus-diagnostics-YYYYMMDD-HHmmss.json` chosen via a save
  dialog; the containing folder is revealed on success.
- Contents: app version + Electron/Chrome/Node/V8 versions + OS info; a
  settings snapshot; workflow and automation counts (total/enabled) with
  structural summaries (node kinds/types, edge counts, schedule flags); last
  workflow and last automation run times; scheduler timer + watcher status;
  settings-file and logs-dir read/write checks; the last 300 log lines and the
  most recent error entries (file + in-memory ring buffer).
- **Privacy:** everything passes through a redaction layer before being
  written — object keys matching apiKey / access key / token / password /
  secret / authorization / bearer / cookie / credential are masked, and
  `Bearer <token>` or `key: value` fragments embedded in log strings are
  scrubbed. Structure and non-sensitive values are preserved.
- **Resilience:** each section is collected in its own try/catch; a failing
  source (e.g. unreadable log file) is recorded under `sectionErrors` and the
  bundle still exports. Missing logs produce an empty section, not a failure.
  Export is strictly read-only: it never restarts schedulers or touches user
  data.
- New IPC: `diagnostics:export` (main-process file access only; renderer never
  touches Node APIs). New service `electron/services/diagnosticsService.js`
  with unit tests; Playwright e2e covers the panel, success, failure, and
  cancel paths.

## 2.5.5 — Stability release (2026-07-06)

Final stabilization pass. No new major features; this release focuses on
scheduler correctness, crash/white-screen resilience, data safety, and a new
built-in diagnostics panel. Everything remains local and free — no external
APIs, no paid services.

### Workflow / automation scheduler fixes

- **Fixed duplicate execution of migrated rules.** Legacy automations viewed in
  the visual workflow editor are a migration *view*; background execution now
  only runs user-saved workflows, and a flat automation whose id also exists as
  a saved workflow is skipped by the flat-rule engine. Previously the same rule
  could run twice per file event / schedule tick.
- **Fixed minute-by-minute misfiring of migrated schedule rules.** Migration now
  produces deterministic node ids, so schedule dedupe keys are stable across
  scheduler ticks.
- **Fixed multi-schedule workflows firing every branch.** A workflow with two
  schedule triggers (e.g. "every 5 min" + "daily 09:00") now only runs the
  branch whose trigger is actually due (`dueNodeIds` filter).
- **Schedule state now survives restarts.** Last-fired times are persisted to
  `schedule-state.json` in userData, so restarting the app no longer re-fires a
  daily rule inside its window or resets interval timers.

### Stability / data safety

- **Atomic settings writes.** `user-settings.json` is written via
  temp-file + rename, so a crash or power loss mid-save can no longer corrupt
  the whole settings file (corruption recovery with backup already existed).
- **Renderer crash recovery.** A page-level React ErrorBoundary shows a readable
  error card with Retry / Reload instead of a white screen; the sidebar keeps
  working. The main process also reloads the window if the renderer process
  dies and retries transient load failures.
- **No more stuck loading states.** All long-running page loads (Automations,
  Projects, Rules, System Monitor, Health Monitor, Security Center, Clean
  Center scan/clean, Updates, Activity History) now use try/finally and surface
  errors as toasts/alerts instead of hanging forever on an IPC failure.

### New: Diagnostics / Repair panel (Settings → 診斷/修復)

- Shows app version, workflow and automation counts (total/enabled), last
  workflow run time, settings-file read/write health, scheduler timer status,
  and folder-watcher status.
- Safe repair actions: reload schedules & monitoring, clear the schedule
  dedupe cache, and re-normalize local settings (fills missing fields with
  defaults without deleting user data). All actions only touch app-owned state.

### Housekeeping

- Version bumped to 2.5.5; README badges and install paths updated.
- Regression tests added for the scheduler fixes (deterministic migration ids,
  saved-vs-migrated workflow separation, due-node schedule filtering).
