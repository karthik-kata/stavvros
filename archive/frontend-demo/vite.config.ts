import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev`          -> mock backend (default). Set VITE_API_MODE=live to use the FastAPI backend.
// `npm run build:single` -> one self-contained HTML file in dist-single/ for demos.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'single' ? { outDir: 'dist-single' } : undefined,
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
}));
