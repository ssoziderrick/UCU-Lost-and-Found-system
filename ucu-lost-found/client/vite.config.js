import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development, /api requests are proxied to the Express server so the
// session cookie stays same-origin (no CORS configuration needed).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // API_PROXY lets you point at an API on another port, e.g. API_PROXY=http://localhost:4001
  server: { port: 5173, proxy: { '/api': process.env.API_PROXY || 'http://localhost:4000' } },
  test: { environment: 'node' },
});
