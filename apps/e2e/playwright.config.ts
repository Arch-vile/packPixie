import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Fail fast on CI if test.only was accidentally committed
  forbidOnly: !!process.env.CI,

  // Retry failed tests on CI; no retries locally
  retries: process.env.CI ? 2 : 0,

  // Single worker on CI to avoid resource contention; full parallelism locally
  workers: process.env.CI ? 1 : undefined,

  // GitHub Actions annotations on CI; HTML report (opens on failure) locally
  reporter: process.env.CI
    ? 'github'
    : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

  // Artifact output directory (screenshots, traces)
  outputDir: 'test-results',

  // Settings shared across all test projects
  use: {
    // Target the Vite dev server; override with BASE_URL env var (PW-02, PW-03)
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',

    // Collect trace on first retry; keeps artifact size manageable
    trace: 'on-first-retry',

    // Screenshot only on failure
    screenshot: 'only-on-failure',
  },

  // Chromium only — D-01
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
