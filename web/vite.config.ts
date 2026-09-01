import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    open: true,
    proxy: {
      '/api': { target: 'http://localhost:5178', changeOrigin: true },
    },
  },
});
