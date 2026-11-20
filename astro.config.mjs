import { defineConfig } from 'astro/config';

// СИГМА 3.0 FINALITY — Astro Static Site Configuration
export default defineConfig({
  output: 'static',
  outDir: './dist',
  publicDir: './public',
  build: {
    format: 'file',
    assets: '_astro',
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
  },
});
