import { resolve } from 'path';
import { defineConfig } from 'vite';

// Обычный HTML/CSS/JS без фреймворка (см. README) — Vite используется только
// как dev-сервер с проксёй на /api и /ws и как сборщик статики для прода.
export default defineConfig({
  base: './',
  server: {
    port: 3100,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
      },
    },
  },
});
