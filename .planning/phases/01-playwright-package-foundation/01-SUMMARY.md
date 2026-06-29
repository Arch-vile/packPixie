# Phase 1: Playwright Package Foundation — Summary

**Executed:** 2026-06-27
**Status:** Complete
**Commits:** fe8f6f9, 04b2139

## Goal

`apps/e2e` workspace package exists with Playwright installed and configured. `pnpm test:e2e` runs from repo root and exits with "no tests found" — not a config error.

## What Was Delivered

### Plan 1: apps/e2e Package Scaffold ✓

- `apps/e2e/package.json` — `@packpixie/e2e` workspace package, `@playwright/test@1.60.0` (exact pin, required by 14-day minimumReleaseAge constraint in pnpm-workspace.yaml)
- `apps/e2e/tsconfig.json` — mirrors `apps/api/tsconfig.json` (ES2022, ESNext, strict)
- `apps/e2e/tests/.gitkeep` — empty scaffold for `testDir: './tests'`
- `apps/e2e/.gitignore` — `node_modules/`, `test-results/`, `playwright-report/`

### Plan 2: Turbo + Root Script Integration ✓

- `turbo.json` — `e2e` task added: `{ "dependsOn": ["^build"], "cache": false }`
- `package.json` (root) — `"test:e2e": "turbo run e2e"` added; existing `test` script untouched

### Plan 3: Playwright Config + Install Verification ✓

- `apps/e2e/playwright.config.ts` — Chromium only, CI/local reporter toggle, `BASE_URL` env var, no globalSetup/Teardown
- `pnpm install` — resolved `@playwright/test@1.60.0` correctly
- Chromium binary installed to `~/Library/Caches/ms-playwright/chromium-1223`
- **UAT gate passed:** `pnpm test:e2e` → `Error: No tests found` (config loads cleanly)

## UAT Verification

| Criterion                                                                | Result                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `pnpm install` succeeds, `@packpixie/e2e` recognized                     | ✓ `@packpixie/e2e 1.0.0` in `pnpm list -r`            |
| `pnpm test:e2e` exits with "no tests found"                              | ✓ `Error: No tests found` (not a config/import error) |
| `BASE_URL` env var override works, falls back to `http://localhost:5173` | ✓ Configured in playwright.config.ts                  |

## Requirements Coverage

| Requirement                                                  | Status                                          |
| ------------------------------------------------------------ | ----------------------------------------------- |
| PKG-01: `apps/e2e` package with package.json + tsconfig.json | ✓                                               |
| PKG-02: pnpm-workspace.yaml covers `apps/e2e`                | ✓ (pre-satisfied by `apps/*` glob)              |
| PKG-03: `turbo.json` has `e2e` task                          | ✓                                               |
| PKG-04: `pnpm test:e2e` triggers the suite                   | ✓                                               |
| PW-01: `playwright.config.ts` with TypeScript + ESM          | ✓                                               |
| PW-02: Playwright targets Vite dev server URL                | ✓ `baseURL: 'http://localhost:5173'`            |
| PW-03: `BASE_URL` and API URL configurable via env vars      | ✓ `process.env.BASE_URL`                        |
| PW-04: Artifacts saved to `test-results/`                    | ✓ `outputDir: 'test-results'`                   |
| PW-05: Reporter configured for CI (github) and local (html)  | ✓ `process.env.CI ? 'github' : [['html', ...]]` |

## Key Decisions Applied

- **D-01:** Chromium only — `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]`
- **D-02:** Dedicated `e2e` Turbo task — not folded into `test`
- **D-03:** `turbo run e2e` at root, `playwright test` in package
- **D-04:** Existing `test` task and script untouched

## Critical Detail for Phase 2

`@playwright/test` is pinned to `1.60.0` (exact). The workspace `minimumReleaseAge: 20160` (14-day strict) blocks 1.61.x. When upgrading Playwright in future, verify the release date is >14 days old before changing the version. Also run `pnpm --filter @packpixie/e2e run install:browsers` after any Playwright version change.

## Next Phase

**Phase 2: Stack Orchestration + DB Initialization**

- DynamoDB Local (Docker) startup in global Playwright setup
- Fastify API and Vite client server startup scripts
- DynamoDB table creation + test data seeding
- Cognito test user auth helper

---

_Phase 1 complete: 2026-06-27_
