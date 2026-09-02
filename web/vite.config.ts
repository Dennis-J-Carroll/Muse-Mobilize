import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    // 5178 belongs to Express. Falling through there creates a self-proxy /api loop.
    strictPort: true,
    open: true,
    proxy: {
      '/api': { target: 'http://localhost:5178', changeOrigin: true },
    },
  },
});
