/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev proxies /api to the API container (spec §10). VITE_API_BASE_URL is
// empty locally, so requests are same-origin and this proxy mimics the gateway.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    // Tests assume the same-origin (empty) API base; a developer's .env.local
    // (e.g. VITE_API_BASE_URL=https://…-dev) would otherwise leak in via Vite
    // and rewrite every fetch URL, timing out live-section suites in jsdom.
    env: { VITE_API_BASE_URL: '' },
  },
});
