import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The UI only runs inside Electron (scripts/dev.ts), on the app://dnd origin, which proxies to this
// server. The HMR client must therefore be told where the websocket actually is.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { protocol: 'ws', host: 'localhost', port: 5173 },
  },
});
