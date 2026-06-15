import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite builds only the renderer (React) part of the app.
// The Electron main/preload processes are plain CommonJS and are NOT bundled by Vite.
export default defineConfig({
  plugins: [react()],
  // Use relative base so the built index.html works when loaded from file:// in the packaged app.
  base: './',
  root: '.',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
