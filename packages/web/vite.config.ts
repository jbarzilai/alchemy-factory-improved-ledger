import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const webDir = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: path.join(webDir, 'client'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@design': path.resolve(webDir, '../../design') } },
  build: { outDir: path.join(webDir, 'dist/client'), emptyOutDir: true },
});
