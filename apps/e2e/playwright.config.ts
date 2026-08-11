import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';

// CRITICAL: Load .env.test before defineConfig so process.env is populated when
// webServer processes are spawned. override:false lets CI environment variables
// take precedence over .env.test values.
loadEnv({ path: resolve(import.meta.dirname, '.env.test'), override: false });

import { defineConfig, devices } from '@playwright/test';

// process.env values are string | undefined; webServer.env requires Record<string, string>
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined),
) as Record<string, string>;

export default defineConfig({
  testDir: './tests',

  // Fail fast on CI if test.only was accidentally committed
  forbidOnly: !!process.env.CI,

  retries: 0,

  // Single worker on CI to avoid resource contention; full parallelism locally
  workers: process.env.CI ? 1 : undefined,

  // GitHub Actions annotations on CI; HTML report (opens on failure) locally.
  // Array form required on CI: 'github' (string) emits only annotations — it does not
  // write playwright-report/ to disk, so the upload-artifact step would have nothing to upload.
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

  // Artifact output directory (screenshots, traces)
  outputDir: 'test-results',

  // Global setup/teardown hooks (Phase 2)
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  // Settings shared across all test projects
  use: {
    // Target the Vite dev server; override with BASE_URL env var (PW-02, PW-03)
    baseURL: process.env.BASE_URL,

    // Collect trace on first retry; keeps artifact size manageable
    trace: 'on-first-retry',

    // Screenshot only on failure
    screenshot: 'only-on-failure',

    // All tests start authenticated via session saved by globalSetup (D-10, AUTH-03)
    storageState: '.auth/user.json',
  },

  // Chromium only — D-01
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start API and Vite before tests; Playwright manages process lifecycle (D-03, D-04)
  webServer: [
    {
      // Fastify API — dev script in apps/api/package.json is 'tsx watch src/index.ts'
      command: 'pnpm --filter api dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { ...env, NODE_ENV: 'test' },
    },
    {
      // Vite React SPA — dev script in apps/client/package.json is 'vite'
      command: 'pnpm --filter client dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env,
    },
  ],
});
