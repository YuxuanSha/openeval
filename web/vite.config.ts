import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const target = process.env.OPENEVAL_BACKEND_URL || 'http://127.0.0.1:4318';
export default defineConfig({
  plugins: [react()], base: '/', cacheDir: '.vite-cache',
  server: {
    fs: { strict: true },
    proxy: {
      '/api': {
        target, changeOrigin: true,
        configure: proxy => { proxy.on('proxyReq', request => request.setHeader('Origin', target)); },
      },
    },
  },
});
