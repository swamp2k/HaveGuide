import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), cloudflare(mode === 'e2e' ? {
    configPath: './tests/e2e/wrangler.jsonc',
    remoteBindings: false,
    persistState: { path: process.env.E2E_STATE_PATH! },
  } : undefined)],
  build: {
    sourcemap: true,
  },
}));
