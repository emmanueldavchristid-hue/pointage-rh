import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Cible du backend (surcharge possible : API_TARGET=http://192.168.1.10:4000 npm run dev)
const target = process.env.API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/uploads': { target, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target, changeOrigin: true },
      '/uploads': { target, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
