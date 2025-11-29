import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    // Polyfill process.env for libraries that might expect it, preventing crashes
    'process.env': {}
  }
});
