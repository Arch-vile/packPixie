# Roadmap: PackPixie E2E Testing Infrastructure

**Created:** 2026-06-27
**Status:** Active — Phase 1 not started

## Phases

### Phase 1: Playwright Package Foundation

**Goal:** `apps/e2e` workspace package exists, Playwright is installed and configured, and a developer can run the suite (even with no tests) without errors.

**Deliverables:**
- `apps/e2e/package.json` — workspace package with Playwright dependency
- `apps/e2e/tsconfig.json` — TypeScript config aligned with repo conventions (ESM)
- `apps/e2e/playwright.config.ts` — base configuration (base URL from env, reporters, artifact dirs)
- `apps/e2e/tests/` — empty directory scaffolded for test files
- `pnpm-workspace.yaml` — updated if `apps/*` glob doesn't already cover `apps/e2e`
- `turbo.json` — `e2e` task added
- Root `package.json` — `test:e2e` script wired up
- `apps/e2e/.gitignore` — ignore test-results, playwright-report, node_modules

**Requirements covered:** PKG-01–04, PW-01–05

**UAT criteria:**
- `pnpm install` succeeds with `apps/e2e` recognized as a workspace package
- `pnpm test:e2e` exits with "no tests found" rather than a configuration error
- Playwright config reads `BASE_URL` from env, falls back to `http://localhost:5173`

---

### Phase 2: Stack Orchestration + DB Initialization

**Goal:** Before any test runs, DynamoDB Local starts (Docker), the API and client servers start, the DynamoDB table is created, and test data is seeded. After tests, everything tears down cleanly.

**Deliverables:**
- `apps/e2e/global-setup.ts` — Playwright global setup: starts DynamoDB Local container, creates table, seeds data, starts API server, starts Vite client
- `apps/e2e/global-teardown.ts` — stops all processes and Docker container, cleans up table
- `apps/e2e/src/db/init.ts` — DynamoDB table creation script (mirrors production schema)
- `apps/e2e/src/db/seed.ts` — seeds minimum test data
- `apps/e2e/src/auth/login.ts` — Playwright auth helper: logs in Cognito test user, saves `storageState`
- `apps/e2e/.env.example` — documents required env vars (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `DYNAMODB_TABLE`, `LOCAL_DYNAMODB_URL`)
- `apps/e2e/README.md` — local setup instructions (Docker required, env vars, test user creation)

**Requirements covered:** ORCH-01–05, DB-01–04, AUTH-01–04

**Plans:** 4 plans (2 waves)
Plans:
- [ ] 02-PLAN.md Plan 1 — Dependencies + environment files (package.json, tsconfig.json, .env.example, .gitignore)
- [ ] 02-PLAN.md Plan 2 — DB layer + auth helper (src/db/init.ts, src/db/seed.ts, src/auth/login.ts)
- [ ] 02-PLAN.md Plan 3 — Global setup + teardown (global-setup.ts, global-teardown.ts)
- [ ] 02-PLAN.md Plan 4 — Playwright config update + README (playwright.config.ts, README.md)

**UAT criteria:**
- `pnpm test:e2e` with a real `.env.test` starts DynamoDB Local, creates the table, and tears everything down cleanly on exit
- Re-running immediately after a run doesn't fail due to leftover containers or table state
- Missing `TEST_USER_EMAIL` env var produces a clear error before any test runs

---

### Phase 3: GitHub Actions CI Pipeline

**Goal:** The E2E suite runs automatically on push to `main` and on PRs via GitHub Actions, with DynamoDB Local as a service container and Cognito credentials from secrets.

**Deliverables:**
- `.github/workflows/e2e.yml` — CI workflow:
  - Triggers: `push` to `main`, `pull_request`
  - DynamoDB Local as a `services:` container (port 8000)
  - pnpm + Playwright browser cache steps
  - Install → build model package → run E2E suite
  - Upload Playwright report and artifacts on failure
- `apps/e2e/README.md` — updated with CI secrets documentation (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`)

**Requirements covered:** CI-01–05

**UAT criteria:**
- A push to a feature branch triggers the workflow
- DynamoDB Local is reachable at `http://localhost:8000` in the CI job
- Playwright report is uploaded as an artifact when a test fails
- pnpm and browser caches hit on the second run (reduced run time)

---

### Phase 4: Baseline E2E Tests

**Goal:** A meaningful smoke test suite exists that exercises the core happy path end-to-end through a real browser.

**Deliverables:**
- `apps/e2e/tests/auth.spec.ts` — login smoke test (app loads, user can log in, sees dashboard)
- `apps/e2e/tests/trip.spec.ts` — core flow test: create a trip → add a packing item → verify the item appears in the trip list
- `apps/e2e/src/fixtures/` — shared Playwright fixtures for authenticated page context

**Requirements covered:** TEST-01–03

**UAT criteria:**
- Both test files pass locally with a real Cognito test user
- Both test files pass in GitHub Actions CI
- A deliberately broken route returns a clear Playwright failure (tests actually check behavior, not just load)

---

## Milestone Summary

| Phase | Focus | Key Requirement IDs |
|-------|-------|---------------------|
| 1 | Playwright package + config | PKG-01–04, PW-01–05 |
| 2 | Stack orchestration + DB + auth helpers | ORCH-01–05, DB-01–04, AUTH-01–04 |
| 3 | GitHub Actions CI pipeline | CI-01–05 |
| 4 | Baseline E2E tests | TEST-01–03 |

**Total v1 requirements:** 28
**Covered by roadmap:** 28 ✓

---
*Roadmap created: 2026-06-27*
*Last updated: 2026-06-27 after initialization*
