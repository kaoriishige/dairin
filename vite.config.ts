import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: ['es2019', 'safari13', 'ios13'],
    cssTarget: ['safari13', 'ios13'],
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});
