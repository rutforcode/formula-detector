import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the app under /formula-detector/, so production
  // assets need that subpath. Dev mode keeps the plain root URL.
  base: mode === 'production' ? '/formula-detector/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
