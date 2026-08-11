# Phase 2: Stack Orchestration + DB Initialization - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the infrastructure that starts the full application stack before any test runs and tears it down after. Concretely: DynamoDB Local starts via testcontainers, the DynamoDB table is created with the correct schema, the Fastify API and Vite dev server start via Playwright's `webServer` config, a Cognito test user authenticates through the browser UI and saves session state, and everything tears down cleanly. After this phase, `pnpm test:e2e` starts the full stack automatically. Phase 3 (CI pipeline) and Phase 4 (tests) build on top of this.

</domain>

<decisions>
## Implementation Decisions

### DynamoDB Local Startup
- **D-01:** Use the **testcontainers-node** library (`testcontainers` npm package) to start DynamoDB Local. Testcontainers handles container readiness automatically and cleans up on process exit — no manual readiness-poll loop needed. Image: `amazon/dynamodb-local`.
- **D-02:** DynamoDB Local container is started in **global-setup.ts** (Playwright global setup hook). Container port is mapped to `localhost:8000`.

### API + Vite Server Startup
- **D-03:** Use Playwright's **built-in `webServer` config** (array form) in `playwright.config.ts` to start both the Fastify API and Vite dev server. Playwright manages process lifecycle (start before tests, kill after), waits for the health URL automatically. No manual `child_process` management.
- **D-04:** Both servers are started — API and Vite client. Tests need both: Playwright drives the browser (Vite), which calls the API.
- **D-05:** API webServer entry: command starts Fastify with env vars injected (`DYNAMODB_TABLE`, `LOCAL_DYNAMODB_URL`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `NODE_ENV=test`). Health check URL: `http://localhost:3001/health`.
- **D-06:** Vite webServer entry: command is `pnpm --filter client dev`. Health check URL: `http://localhost:5173`. The `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, and `VITE_COGNITO_USER_POOL_CLIENT_ID` env vars must be set when Vite starts.

### Authentication
- **D-07:** Auth is handled via **browser UI login flow** — a setup fixture (or global-setup browser context) drives the browser through the AWS Amplify UI login form (types email + password, waits for redirect). This exercises the real auth flow including Cognito token exchange.
- **D-08:** After successful login, Playwright saves the browser's `storageState` (localStorage + cookies) to `apps/e2e/.auth/user.json`. This file is gitignored.
- **D-09:** Test credentials come from env vars: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`. Auth setup aborts with a clear error if any are missing.
- **D-10:** Auth setup runs **once** in global-setup (not per-test). Tests reference the saved storageState via a Playwright fixture so they skip the login flow.

### Database Schema
- **D-11:** DynamoDB table schema (from `dynamoDB-architecture.md`):
  - Table name: read from `DYNAMODB_TABLE` env var (e.g., `packpixie-test`)
  - PK: `PK` (String), SK: `SK` (String)
  - GSI1: `GSI1PK` (String, hash), `GSI1SK` (String, range) — index name: `GSI1`
  - BillingMode: PAY_PER_REQUEST (DynamoDB Local supports this)
- **D-12:** Global setup creates the table. Global teardown deletes the table (not just items) — ensures a fully clean slate for the next run.

### Teardown
- **D-13:** Global teardown deletes the DynamoDB table and stops the testcontainers container. The container cleanup is handled by testcontainers automatically (it registers a shutdown hook), but teardown explicitly calls `container.stop()` as well.
- **D-14:** `webServer` processes (API + Vite) are killed by Playwright automatically when the test runner exits — no manual teardown needed for them.

### the agent's Discretion
- **File structure**: `apps/e2e/src/db/init.ts` (table creation), `apps/e2e/src/db/seed.ts` (test data seeding), `apps/e2e/src/auth/login.ts` (auth helper), `apps/e2e/global-setup.ts`, `apps/e2e/global-teardown.ts`
- **Auth storage path**: `apps/e2e/.auth/user.json` — add to `.gitignore`
- **Seeding**: Seed one test trip with one item per test run. Enough for Phase 4 smoke tests.
- **Env var loading in tests**: Use `dotenv` to load `apps/e2e/.env.test` in global-setup. The `.env.test` file must be present locally; CI injects vars directly as secrets.
- **testcontainers version**: Must pass pnpm's 14-day `minimumReleaseAge` constraint (same as Playwright 1.60.0 issue in Phase 1). Check npm publish date before choosing a version.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Context
- `.planning/ROADMAP.md` — Phase 2 deliverables and UAT criteria
- `.planning/REQUIREMENTS.md` — ORCH-01–05, DB-01–04, AUTH-01–04
- `.planning/phases/01-playwright-package-foundation/01-SUMMARY.md` — what Phase 1 delivered (package structure, playwright.config.ts)

### Application Architecture (schema and config)
- `dynamoDB-architecture.md` — **CRITICAL**: exact DynamoDB table schema (PK/SK/GSI1 attribute names and types)
- `apps/api/src/lib/dynamodb.ts` — how the API creates the DynamoDB client (`LOCAL_DYNAMODB_URL` env var)
- `apps/api/src/config.ts` — required API env vars (`DYNAMODB_TABLE`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`)
- `apps/api/src/index.ts` — API startup, `/health` endpoint, required env vars
- `apps/client/src/config.ts` — Vite env vars (`VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_USER_POOL_CLIENT_ID`)

### Existing E2E Package
- `apps/e2e/package.json` — current devDependencies (add testcontainers here)
- `apps/e2e/playwright.config.ts` — **MUST BE UPDATED**: add `webServer`, `globalSetup`, `globalTeardown`
- `apps/e2e/.gitignore` — add `.auth/`, `.env.test`

</canonical_refs>

<specifics>
## Specific Implementation Notes

- **Order in global-setup:** (1) Start DynamoDB Local container → (2) Create table → (3) Seed data → (4) Launch browser context → (5) Run UI login → (6) Save storageState → (7) Close browser context. Servers (API + Vite) are started by Playwright's `webServer` config BEFORE global-setup runs — they're already up when global-setup executes.
- **`webServer.reuseExistingServer`**: Set to `true` in local dev (avoids killing a running dev server), `false` in CI (always fresh). Use `process.env.CI ? false : true`.
- **playwright.config.ts changes**: Add `globalSetup: './global-setup.ts'`, `globalTeardown: './global-teardown.ts'`, and `webServer: [...]` array. Also add `use.storageState: '.auth/user.json'` so all tests reuse saved auth. These are additive changes to the existing Phase 1 config.
- **API start command**: `pnpm --filter api dev` or `tsx watch src/index.ts` from `apps/api/`. Check which command in `apps/api/package.json`.
- **testcontainers container reference**: global-setup must export the container instance so global-teardown can call `container.stop()`. Use Playwright's global fixture mechanism or write the container ID to a temp file.
- **`.env.example`**: Create `apps/e2e/.env.example` documenting all required env vars with placeholder values.

</specifics>

<deferred>
## Deferred Ideas

- Docker Compose alternative approach — explicitly deferred (testcontainers chosen)
- Direct Cognito API auth (InitiateAuth) — deferred (browser UI chosen)
- Per-test DB isolation (separate table per test) — v2 concern
- Multi-user test data seeding — v2 concern (Phase 4 only needs one user's data)

</deferred>

---

*Phase: 02-stack-orchestration-db-initialization*
*Context gathered: 2026-06-27 via discuss-phase*
