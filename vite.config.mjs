import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Read the app version from package.json so the UI can show it without hardcoding.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Vite builds only the renderer (React) part of the app.
// The Electron main/preload processes are plain CommonJS and are NOT bundled by Vite.
export default defineConfig({
  plugins: [react()],
  // Inject the package.json version as a compile-time constant (used by src/layout/Sidebar.jsx).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Use relative base so the built index.html works when loaded from file:// in the packaged app.
  base: './',
  root: '.',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Never auto-open a browser: the dev UI is meant to run INSIDE the Electron
    // window (which provides window.api via preload), not in Edge/Chrome.
    open: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          flow: ['@xyflow/react'],
          three: ['three'],
        },
      },
    },
  },
});
