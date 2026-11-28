import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeSwitch } from './scripts/build/themeSwitch';

// The UI only runs inside Electron (scripts/dev.ts), on the app://dnd origin, which proxies to this
// server. The HMR client must therefore be told where the websocket actually is.
export default defineConfig({
  plugins: [react()],
  // Night rules are written inside @media (prefers-color-scheme: dark); this also lets the theme switch force them.
  css: { postcss: { plugins: [themeSwitch()] } },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { protocol: 'ws', host: 'localhost', port: 5173 },
  },
});
