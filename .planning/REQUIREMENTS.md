# Requirements: PackPixie E2E Testing Infrastructure

**Defined:** 2026-06-27
**Core Value:** Any developer can run `pnpm test:e2e` and get a reliable green/red signal against a real, fully initialized application stack.

## v1 Requirements

### Package Structure

- [ ] **PKG-01**: `apps/e2e` directory exists as a pnpm workspace package with its own `package.json` and `tsconfig.json`
- [ ] **PKG-02**: `pnpm-workspace.yaml` includes `apps/e2e` (or already covers `apps/*`)
- [ ] **PKG-03**: `turbo.json` includes an `e2e` task definition
- [ ] **PKG-04**: `pnpm test:e2e` script at repo root triggers the E2E suite

### Playwright Configuration

- [ ] **PW-01**: `playwright.config.ts` configured with TypeScript and ESM
- [ ] **PW-02**: Playwright targets the running Vite dev server URL
- [ ] **PW-03**: Playwright base URL and API URL are configurable via environment variables
- [ ] **PW-04**: Test artifacts (screenshots, traces, videos on failure) are saved to a local directory
- [ ] **PW-05**: Playwright reporter configured for CI (GitHub Actions reporter) and local (HTML reporter)

### Stack Orchestration

- [ ] **ORCH-01**: Global Playwright setup script starts DynamoDB Local (Docker) before any test
- [ ] **ORCH-02**: API server starts in test mode (pointing at DynamoDB Local) before tests
- [ ] **ORCH-03**: Vite client dev server starts before tests
- [ ] **ORCH-04**: Global teardown stops all started processes and Docker containers cleanly
- [ ] **ORCH-05**: Setup/teardown is idempotent — reruns don't fail due to leftover state

### Database Initialization

- [ ] **DB-01**: Global setup creates the DynamoDB table with the correct schema (GSI, attribute types matching the production table definition)
- [ ] **DB-02**: Global setup seeds minimum required test data (at least one test user's baseline state)
- [ ] **DB-03**: Global teardown deletes the table (or truncates all items) so the next run starts clean
- [ ] **DB-04**: DB initialization is driven by environment variables (`DYNAMODB_TABLE`, `LOCAL_DYNAMODB_URL`)

### Authentication

- [ ] **AUTH-01**: Test credentials (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`) are read from environment variables
- [ ] **AUTH-02**: A Playwright auth helper logs in the Cognito test user and saves session state
- [ ] **AUTH-03**: Tests can reuse the saved auth session to avoid logging in on every test
- [ ] **AUTH-04**: Instructions exist for creating the Cognito test user (README or setup script)

### CI Integration

- [ ] **CI-01**: GitHub Actions workflow file at `.github/workflows/e2e.yml` runs on push to `main` and on pull requests
- [ ] **CI-02**: DynamoDB Local runs as a Docker service container in the CI job
- [ ] **CI-03**: Cognito test user credentials are injected from GitHub Actions secrets (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`)
- [ ] **CI-04**: Playwright test artifacts (traces, screenshots) are uploaded as CI artifacts on failure
- [ ] **CI-05**: CI job caches pnpm store and Playwright browsers to keep run times acceptable

### Baseline Tests

- [ ] **TEST-01**: At least one smoke test verifies the app loads and the user can log in
- [ ] **TEST-02**: At least one test covers the core happy path: create a trip → verify the trip appears in the list (item addition deferred — no item API exists in v1)
- [ ] **TEST-03**: Tests pass in both local and CI environments without code changes

## v2 Requirements

### Extended Coverage

- **COV-01**: Test coverage for all major user flows (assign item, mark packed, view carry distribution)
- **COV-02**: Multi-user test scenarios (owner + collaborator flows)
- **COV-03**: Error path tests (network failures, invalid input)

### Developer Experience

- **DX-01**: `pnpm test:e2e:ui` launches Playwright UI mode for interactive test development
- **DX-02**: Docker Compose file for spinning up the full local test stack independently

## Out of Scope

| Feature | Reason |
|---------|--------|
| Unit or component tests | This milestone is E2E infrastructure only; unit tests are a separate concern |
| Mocking Cognito / bypassing auth | Real test user was chosen — bypass approach is explicitly excluded |
| AWS DynamoDB in CI | DynamoDB Local covers all needs; real AWS adds cost and credentials complexity |
| Performance / load testing | Out of scope for E2E plumbing milestone |
| Visual regression testing | No requirement raised; can be added in v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01–04 | Phase 1 | Pending |
| PW-01–05 | Phase 1 | Pending |
| ORCH-01–05 | Phase 2 | Pending |
| DB-01–04 | Phase 2 | Pending |
| AUTH-01–04 | Phase 2 | Pending |
| CI-01–05 | Phase 3 | Pending |
| TEST-01–03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-27*
*Last updated: 2026-06-27 after initialization*
