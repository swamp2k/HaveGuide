import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';

// Preserve developer data and give the first-user journey a fresh DB on every run.
mkdirSync('.wrangler', { recursive: true });
const statePath = mkdtempSync('.wrangler/e2e-');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npx wrangler d1 migrations apply DB --local --config tests/e2e/wrangler.jsonc --persist-to ${statePath} && npm run dev -- --mode e2e --host 127.0.0.1 --strictPort`,
    env: { E2E_STATE_PATH: statePath, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
