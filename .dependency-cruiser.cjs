/**
 * Architecture dependency rules for PC Life Assistant.
 *
 * This repo uses Electron's process boundary as the main architecture boundary:
 * - electron/main.js owns app lifecycle and IPC registration.
 * - electron/preload.js is the only renderer bridge.
 * - electron/services/** owns Node-side I/O and desktop capabilities.
 * - src/** is the sandboxed React renderer.
 */
module.exports = {
  forbidden: [
    {
      name: 'renderer-must-not-import-electron-code',
      comment: 'Renderer code must talk to the backend through window.api only.',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^electron/' },
    },
    {
      name: 'electron-must-not-import-renderer-code',
      comment: 'Main, preload, and services must not depend on renderer modules.',
      severity: 'error',
      from: { path: '^electron/' },
      to: { path: '^src/' },
    },
    {
      name: 'preload-is-bridge-only',
      comment: 'Preload exposes the IPC bridge; capability logic belongs in main/services.',
      severity: 'error',
      from: { path: '^electron/preload\\.js$' },
      to: { path: '^electron/services/' },
    },
    {
      name: 'services-must-not-import-ui',
      comment: 'Node-side services cannot depend on UI, layout, or page modules.',
      severity: 'error',
      from: { path: '^electron/services/' },
      to: { path: '^(src/components|src/layout|src/pages)/' },
    },
    {
      name: 'renderer-services-must-not-import-ui',
      comment: 'Renderer service clients should stay reusable and not depend on views.',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^(src/components|src/layout|src/pages)/' },
    },
    {
      name: 'utils-stay-framework-light',
      comment: 'Shared renderer utilities should remain independent from React views.',
      severity: 'error',
      from: { path: '^src/utils/' },
      to: { path: '^(src/components|src/layout|src/pages)/' },
    },
    {
      name: 'no-circular',
      comment: 'Cycles make Electron/renderer boundaries harder to reason about.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules|dist|build|release|release-auto' },
    exclude: { path: 'node_modules|dist|build|release|release-auto|test-results|\\.test\\.[jt]sx?$' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },
  },
};
