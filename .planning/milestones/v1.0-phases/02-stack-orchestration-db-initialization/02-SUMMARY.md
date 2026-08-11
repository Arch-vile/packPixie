---
phase: 02-stack-orchestration-db-initialization
plan: "01-04"
type: summary
status: complete
completed: 2026-06-28
commits:
  - 8d0382b feat(02-01): add e2e deps, tsconfig paths, .env.example, .gitignore
  - 280c0c8 feat(02-02): add db layer (init, seed) and auth login helper
  - d8d7a54 feat(02-03): add global-setup (DynamoDB Local + seed + login) and global-teardown
  - 8f05b07 feat(02-04): update playwright.config.ts with webServer/globalSetup/storageState; add README
requirements_covered:
  - ORCH-01
  - ORCH-02
  - ORCH-03
  - ORCH-04
  - ORCH-05
  - DB-01
  - DB-02
  - DB-03
  - DB-04
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04
---

# Phase 2 Summary: Stack Orchestration + DB Initialization

## What was built

Full Playwright test stack orchestration — `pnpm test:e2e` now starts the entire application
stack automatically before any test runs and tears it down cleanly on exit.

## Files created / modified

| File | Action | Description |
|------|--------|-------------|
| `apps/e2e/package.json` | Modified | Added testcontainers@12.0.2, dotenv@17.3.1, @aws-sdk/client-dynamodb@^3.962.0, @types/node@^20.14.0 |
| `apps/e2e/tsconfig.json` | Modified | Expanded include to cover global-setup, global-teardown, src/**/* |
| `apps/e2e/.env.example` | Created | Template for required env vars (copy → .env.test, never committed) |
| `apps/e2e/.gitignore` | Modified | Added .auth/, .env.test, .e2e-state.json |
| `apps/e2e/src/db/init.ts` | Created | createTestDynamoDBClient, createTable (PK/SK+GSI1), deleteTable (idempotent) |
| `apps/e2e/src/db/seed.ts` | Created | seedTestData — trip metadata + participant (GSI1 keys) + packing item |
| `apps/e2e/src/auth/login.ts` | Created | loginAndSaveState — Amplify UI login, saves storageState to .auth/user.json |
| `apps/e2e/global-setup.ts` | Created | Starts DynamoDB Local (port 8000), creates table, seeds data, logs in test user |
| `apps/e2e/global-teardown.ts` | Created | Deletes DynamoDB table (idempotent); Ryuk handles container cleanup |
| `apps/e2e/playwright.config.ts` | Modified | dotenv load at top, globalSetup/Teardown, webServer (API+Vite), storageState |
| `apps/e2e/README.md` | Created | Setup guide, Cognito test user creation (AWS CLI), troubleshooting |

## Key technical decisions

- **testcontainers@12.0.2 exact pin** — v12.0.3 (10d old) blocked by pnpm minimumReleaseAge:14d
- **Fixed port 8000** — `withExposedPorts({ container: 8000, host: 8000 })` matches LOCAL_DYNAMODB_URL
- **dotenv before defineConfig** — loads .env.test before webServer processes spawn; `override:false` lets CI env vars win
- **webServer.env spreads ...process.env** — Playwright does not auto-merge webServer.env with parent process.env
- **`waitForSelector` form detach** — replaces `waitForURL` (SPA never navigates); waits for Amplify form to leave DOM
- **Ryuk reaper** — handles container cleanup on process exit; teardown only deletes the table

## Requirements covered

All 13 requirements for Phase 2 covered: ORCH-01–05, DB-01–04, AUTH-01–04.

## UAT gate

UAT requires a real `.env.test` with Cognito credentials and a test user created via AWS CLI
(see apps/e2e/README.md). The structural verification gate passes — all files exist with correct
content. Full end-to-end UAT (actual DynamoDB Local + Cognito login) is ready to run.
