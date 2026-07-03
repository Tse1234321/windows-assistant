# AGENTS.md - PC Life Assistant

## Project Overview
- Purpose: Windows desktop assistant for file organization, project shortcuts, automations, system monitoring, PDF tools, workflow editing, updates, and security checks.
- Stack: Electron, React 18, TypeScript/JavaScript, Vite, Vitest, Playwright, ESLint, Prettier, Three.js.
- Runtime / package manager: Node.js with npm.

## Commands
- Setup: `npm install`
- Dev: `npm run dev`
- Verify: `npm run verify`
- Build: `npm run build`
- Single test: `npm run test -- <path-or-pattern>`
- E2E test: `npm run test:e2e`
- Architecture check: `npm run arch`

## Architecture Map
- `electron/` contains the desktop main process, preload bridge, and Node-side services.
- `src/` contains the React renderer application.
- `src/components/`, `src/layout/`, and `src/pages/` contain UI surfaces and page-level flows.
- `src/services/` contains renderer-side service clients and integrations.
- `src/utils/` contains shared utility logic with colocated Vitest coverage where practical.
- `config/` contains application configuration examples and defaults.

## Architecture Rules
- Electron is the primary boundary: `electron/main.js` owns app lifecycle and IPC registration, `electron/preload.js` is the only renderer bridge, `electron/services/` owns Node-side I/O, and `src/` is the sandboxed renderer.
- Renderer code must not import from `electron/`; use `window.api` methods exposed by preload.
- Electron main, preload, and service code must not import renderer modules from `src/`.
- Service modules must not depend on UI modules such as `src/components/`, `src/layout/`, or `src/pages/`.
- Shared utility code in `src/utils/` should stay framework-light and must not import page, layout, or component modules.
- Every piece of persistent state has one owner; app settings are owned by `electron/services/settingsService.js` and persisted through the settings file described in `ARCHITECTURE.md`.
- Adding a new top-level directory, a new cross-boundary dependency, or a new production dependency requires an ADR in `docs/adr/`.
- Architecture verification is `npm run arch`; if it fails, the task is not done.

## Design Rules
- Before UI work, read `DESIGN.md` and `DESIGN-BRIEF.md`. `DESIGN.md` defines the floor; the brief defines PC Life Assistant's visual personality.
- For a new page or feature, write a short design plan first: audience, page job, palette, type treatment, layout concept, and the one signature element used.
- New UI should consume semantic tokens from `src/styles/tokens.css`; prefer `--surface-1`, `--surface-2`, `--text-1`, `--text-2`, `--accent`, `--accent-text`, `--focus-ring`, `--success`, `--warning`, and `--danger`.
- Use the 4px spacing grid and the existing compact desktop density. Avoid arbitrary one-off spacing values.
- Every touched interactive element needs default, hover, focus-visible, active, and disabled states. Every touched data view needs loading, empty, error, partial, and ideal states where applicable.
- Keep UI keyboard-operable with visible focus, WCAG AA contrast, reduced-motion support, sentence case text, and verb-led button labels.
- Before declaring UI work complete, report the `DESIGN.md` ship checklist results for the changed surface.
- If a requirement conflicts with a design rule, cite the rule and explain the tradeoff instead of silently violating it.

## Conventions
- Keep Electron main-process code in `electron/` and renderer UI code in `src/`.
- Prefer focused service modules over adding broad logic directly to UI components.
- Use existing styling files and component patterns before introducing new UI structure.
- Add or update Vitest coverage when changing shared logic, services, or bug-prone behavior.
- Preserve user data and settings formats unless a task explicitly includes migration work.

## Definition Of Done
1. `npm run verify` passes, or any skipped check is called out with the reason.
2. User-facing UI changes are manually checked in the running app or browser when practical.
3. Electron or filesystem behavior changes include tests or a clear manual verification note.
4. Changes are scoped to the requested behavior and do not overwrite unrelated worktree changes.

## Don'ts
- Do not modify generated output folders such as `dist/`, `release/`, `release-auto/`, or package artifacts unless the task is explicitly about packaging output.
- Do not commit secrets, local machine paths, tokens, or private user data.
- Do not revert unrelated worktree changes.
- Do not change installer/signing/update behavior without verifying the release path affected by the change.
