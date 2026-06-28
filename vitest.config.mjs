import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * Tests import { describe, it, expect } from 'vitest' explicitly (globals off),
 * so the same setup works for both Node-side services (electron/) and pure
 * renderer utilities (src/utils). React component tests can opt into jsdom via
 * a per-file `// @vitest-environment jsdom` pragma.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Keep service tests hermetic: never touch the real Electron binary.
      electron: fileURLToPath(new URL('./test/stubs/electron.js', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'release-auto/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/utils/**', 'electron/services/**'],
      exclude: ['**/*.test.*'],
    },
  },
});
