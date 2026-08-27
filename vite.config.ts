import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // host: true binds to the LAN so the phone can reach the dev server.
  // The preview pane assigns a port via PORT; 5180 is only the fallback.
  server: { port: Number(process.env.PORT) || 5180, host: true },
  // GitHub Pages serves the built site from /<repo>/, so asset URLs need
  // that prefix in production. Local dev and preview stay at the root.
  base: process.env.GITHUB_PAGES ? '/rent4ring/' : '/',
});
