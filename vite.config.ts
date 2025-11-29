import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get API key from .env files OR system environment variables (Cloudflare)
  // Default to empty string to prevent build-time JSON.stringify(undefined)
  const apiKey = env.API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    define: {
      // Stringify the key so it's inserted as a string literal in the client code
      'process.env.API_KEY': JSON.stringify(apiKey),
      // Fallback for other libraries accessing process.env, but API_KEY above takes precedence
      'process.env': {}, 
    }
  };
});
