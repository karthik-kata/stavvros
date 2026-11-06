import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The drift service runs on :8100 (see ../drift-service/README.md).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: { '/api': { target: process.env.STAVVROS_API ?? 'http://localhost:8100', changeOrigin: true } },
  },
});
