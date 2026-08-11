# Phase 3: GitHub Actions CI Pipeline — Research

**Researched:** 2026-06-29
**Domain:** GitHub Actions, Playwright CI, testcontainers, pnpm monorepo
**Confidence:** HIGH (all findings verified against actual project files)

---

## Summary

Phase 3 delivers a single file: `.github/workflows/e2e.yml`. All locked decisions are already made in CONTEXT.md, so research is focused on verifying exact commands, paths, and catching mismatches between the locked decisions and the actual codebase.

Three findings require action beyond creating the workflow file:

1. **playwright.config.ts must be updated** — the current CI reporter is `'github'` (no HTML output). D-05 requires an HTML report artifact. The config must be changed to use an array of reporters so both `github` (for annotations) and `html` (for the artifact) are active in CI.
2. **Dual env var mapping for Cognito** — the API reads `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID`, while the Vite client reads `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_USER_POOL_CLIENT_ID`. The workflow must set **all four** from the two secrets.
3. **Model build is not automatic via Turbo** — `@packpixie/e2e` has no workspace `dependencies`, so Turbo's `^build` does not include `@packpixie/model`. The API and client dev servers (started by Playwright webServer) need `packages/model/dist/` to exist; an explicit `pnpm --filter model build` step is required.

**Primary recommendation:** Follow the CONTEXT.md step order exactly, add the playwright.config.ts reporter fix, and set all four Cognito env vars in the workflow.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 Trigger:** `push` to `main` + `pull_request` targeting `main`
- **D-02 DynamoDB:** testcontainers at runtime — no `services:` block; same code path as local
- **D-03 Cognito:** real Cognito via secrets (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`)
- **D-04 Caching:** None
- **D-05 Artifacts:** Always upload Playwright HTML report, 7-day retention
- **D-06 Versions:** Node.js 22.19.0, pnpm 10.12.1
- **D-07 File:** `.github/workflows/e2e.yml`
- **D-08 Runner:** `ubuntu-latest`
- **D-09 Env vars:** as listed in CONTEXT.md

### the agent's Discretion
- Exact `actions/upload-artifact` version (no existing usage in repo)
- Whether to upload `test-results/` in addition to `playwright-report/`

### Deferred Ideas (OUT OF SCOPE)
- pnpm store + Playwright browser caching
- Matrix testing across multiple browsers
- Slack/email notifications on failure
- Scheduled nightly run against staging
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-01 | Workflow at `.github/workflows/e2e.yml` runs on push to `main` and PRs | Triggers verified against lint.yml pattern |
| CI-02 | DynamoDB Local via testcontainers (no services: block) | global-setup.ts confirmed; Docker available on ubuntu-latest |
| CI-03 | Cognito credentials from GitHub secrets | All four vars mapped; dual API/Vite naming resolved |
| CI-04 | Playwright artifacts uploaded on failure | upload-artifact@v4; D-05 expands to "always" |
| CI-05 | Caching deferred (D-04) | No cache steps in workflow |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DynamoDB Local container lifecycle | Test runner (Playwright globalSetup) | — | `global-setup.ts` starts/stops via testcontainers; workflow has no services: block |
| API server lifecycle | Test runner (Playwright webServer) | — | `playwright.config.ts` webServer starts `pnpm --filter api dev` |
| Client dev server lifecycle | Test runner (Playwright webServer) | — | `playwright.config.ts` webServer starts `pnpm --filter client dev` |
| Secret injection | CI workflow (env: block) | — | Secrets → env vars at job level |
| Artifact upload | CI workflow (upload-artifact step) | — | Runs after tests with `if: always()` |
| Model package build | CI workflow (explicit step) | — | Turbo does not auto-build model for e2e (no workspace dep declared) |

---

## Research Findings

### Q1: Docker availability on ubuntu-latest

[ASSUMED] Docker is pre-installed on GitHub Actions `ubuntu-latest` runners. The Docker daemon is running and `/var/run/docker.sock` is available. Testcontainers connects to the Docker socket automatically — no explicit Docker setup step is needed in the workflow.

**Verdict:** No `services:` block, no Docker login, no extra setup. `global-setup.ts` starts the `amazon/dynamodb-local` container directly via testcontainers. This is exactly what D-02 prescribes.

---

### Q2: pnpm install command

[VERIFIED: .github/workflows/lint.yml] The existing `lint.yml` uses `pnpm install --frozen-lockfile`. This is correct for CI — it errors if the lockfile is out of sync instead of silently updating it.

```bash
pnpm install --frozen-lockfile
```

---

### Q3: Build order — why model must be built explicitly

[VERIFIED: turbo.json, apps/e2e/package.json, packages/model/package.json]

`turbo.json` defines the `e2e` task as:
```json
"e2e": {
  "dependsOn": ["^build"],
  "cache": false
}
```

`^build` means "build all workspace packages that **this package depends on**." However, `apps/e2e/package.json` has **no `dependencies`** — only `devDependencies`. Turbo therefore builds nothing before running the e2e task.

The API and client dev servers (started by Playwright webServer) import `@packpixie/model` from `packages/model/dist/`. If `dist/` doesn't exist, those servers crash on startup.

**Fix:** Explicit step in the workflow:
```bash
pnpm --filter model build
```

`packages/model/package.json` confirms the `build` script is `tsc`.

---

### Q4: Playwright browser install

[VERIFIED: apps/e2e/package.json]

`apps/e2e/package.json` has:
```json
"scripts": {
  "install:browsers": "playwright install --with-deps chromium"
}
```

The `--with-deps` flag installs OS-level system dependencies (libnss, libatk, etc.) alongside the Chromium binary — required on clean Linux CI runners.

**CI command:**
```bash
pnpm --filter @packpixie/e2e run install:browsers
```

---

### Q5: Working directory and run command

[VERIFIED: package.json root, turbo.json]

Root `package.json`:
```json
"test:e2e": "turbo run e2e"
```

Run from the **repo root**:
```bash
pnpm test:e2e
```

Turbo dispatches to `apps/e2e/` and runs `playwright test`. Do NOT `cd apps/e2e` first — Turbo handles the working directory.

---

### Q6: All required environment variables

[VERIFIED: apps/e2e/src/config.ts, apps/api/src/index.ts, apps/api/src/lib/dynamodb.ts, apps/client/src/config.ts]

**From `apps/e2e/src/config.ts` `required()` calls (throws on missing):**

| Variable | Value in CI | Source |
|----------|-------------|--------|
| `AWS_REGION` | `us-east-1` | hardcoded |
| `LOCAL_DYNAMODB_URL` | `http://localhost:8000` | hardcoded |
| `DYNAMODB_TABLE` | `packpixie-test` | hardcoded |
| `BASE_URL` | `http://localhost:5173` | hardcoded |
| `TEST_USER_EMAIL` | `${{ secrets.TEST_USER_EMAIL }}` | secret |
| `TEST_USER_PASSWORD` | `${{ secrets.TEST_USER_PASSWORD }}` | secret |

**From `apps/api/src/index.ts` (API dev server started by webServer — throws if missing):**

| Variable | Value in CI | Source |
|----------|-------------|--------|
| `COGNITO_USER_POOL_ID` | `${{ secrets.COGNITO_USER_POOL_ID }}` | secret |
| `COGNITO_CLIENT_ID` | `${{ secrets.COGNITO_CLIENT_ID }}` | secret |
| `LOCAL_DYNAMODB_URL` | `http://localhost:8000` | hardcoded (above) |

**From `apps/client/src/config.ts` (Vite dev server — browser bundle, needs `VITE_` prefix):**

| Variable | Value in CI | Source |
|----------|-------------|--------|
| `VITE_COGNITO_USER_POOL_ID` | `${{ secrets.COGNITO_USER_POOL_ID }}` | **same secret as API** |
| `VITE_COGNITO_USER_POOL_CLIENT_ID` | `${{ secrets.COGNITO_CLIENT_ID }}` | **same secret as API** — different env var name |
| `VITE_API_URL` | `http://localhost:3001` | hardcoded |
| `VITE_APP_VERSION` | `test` | hardcoded |

> **Critical:** `COGNITO_USER_POOL_ID` secret maps to two env vars: `COGNITO_USER_POOL_ID` (API) and `VITE_COGNITO_USER_POOL_ID` (client). Same for `COGNITO_CLIENT_ID` → `COGNITO_CLIENT_ID` + `VITE_COGNITO_USER_POOL_CLIENT_ID`. Both must be set in the workflow `env:` block.

---

### Q7: Playwright artifact paths

[VERIFIED: apps/e2e/playwright.config.ts]

```typescript
// playwright.config.ts
reporter: process.env.CI
  ? 'github'           // ← GitHub-only, no HTML file written
  : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

outputDir: 'test-results',  // ← screenshots + traces (always written)
```

**Problem:** In CI (`CI=true`), the reporter is `'github'` — a string. No `playwright-report/` directory is created. D-05 requires uploading an HTML report.

**Fix (required code change in Phase 3):** Change `playwright.config.ts` to use an array of reporters in CI:

```typescript
reporter: process.env.CI
  ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
  : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],
```

**Artifact paths (relative to repo root):**
- `apps/e2e/playwright-report/` — HTML report (after the above fix)
- `apps/e2e/test-results/` — screenshots + traces (always present)

Both should be uploaded.

---

### Q8: upload-artifact action version

[ASSUMED] No existing `upload-artifact` usage in the repository (checked all three workflows). The current standard is `actions/upload-artifact@v4` — consistent with `actions/checkout@v4`, `actions/setup-node@v4`, and `pnpm/action-setup@v4` already in use.

```yaml
uses: actions/upload-artifact@v4
```

---

### Q9: Ryuk and testcontainers on ubuntu-latest

[ASSUMED] Testcontainers' Ryuk reaper container works on GitHub Actions `ubuntu-latest` without any special configuration. The Docker socket is available, Ryuk can bind-mount it, and container cleanup is automatic. GitHub Actions runners are ephemeral (fresh VM per job), so even if Ryuk cleanup were to fail, it would not affect subsequent runs.

`TESTCONTAINERS_RYUK_DISABLED` does **not** need to be set.

`global-setup.ts` already handles this correctly:
```typescript
void container; // container lifecycle managed by Ryuk
```

---

### Q10: pnpm workspace filter for browser install

[VERIFIED: apps/e2e/package.json]

The package name is `@packpixie/e2e` and the `install:browsers` script exists:

```bash
# Via pnpm script (preferred — uses the script defined in package.json)
pnpm --filter @packpixie/e2e run install:browsers

# Equivalent direct form
pnpm --filter @packpixie/e2e exec playwright install --with-deps chromium
```

Use the script form (`run install:browsers`) — it's the canonical interface.

---

## Common Pitfalls

### Pitfall 1: HTML reporter not active in CI

**What goes wrong:** `playwright-report/` directory is empty or missing; upload-artifact step succeeds but the artifact contains no useful HTML.

**Why it happens:** `playwright.config.ts` sets `reporter: process.env.CI ? 'github' : ...` — the `'github'` string is a single-reporter shorthand that only emits GitHub annotations, not files.

**How to avoid:** Change the CI branch to an array: `[['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]`. This is a **required code change** alongside the workflow file.

**Warning signs:** `playwright-report/` artifact is empty or missing after a CI run.

---

### Pitfall 2: Missing VITE_COGNITO_USER_POOL_CLIENT_ID

**What goes wrong:** Vite dev server starts, but the Amplify Authenticator renders without configuration; all login attempts fail silently or with a generic Cognito error.

**Why it happens:** The client reads `VITE_COGNITO_USER_POOL_CLIENT_ID` but the CONTEXT.md secret name is `COGNITO_CLIENT_ID`. Without an explicit mapping, the Vite var is never set.

**How to avoid:** Set both in the workflow `env:` block:
```yaml
COGNITO_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
VITE_COGNITO_USER_POOL_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
```

---

### Pitfall 3: Model package not built; API/client fail to start

**What goes wrong:** webServer processes start and immediately crash; Playwright times out waiting for `http://localhost:3001/health` and `http://localhost:5173`.

**Why it happens:** `@packpixie/e2e` has no `dependencies` in its `package.json`, so Turbo's `^build` resolves to nothing. `packages/model/dist/` is absent; the API and client imports fail.

**How to avoid:** Explicit `pnpm --filter model build` step before the E2E run step.

---

### Pitfall 4: Artifact upload path relative to repo root

**What goes wrong:** upload-artifact uploads nothing; the artifact is empty.

**Why it happens:** Playwright config's `outputDir: 'test-results'` is relative to `apps/e2e/`. From the repo root, the correct path is `apps/e2e/test-results/`, not `test-results/`.

**How to avoid:** Use paths relative to the repo root in the upload-artifact `path:` field:
```yaml
path: |
  apps/e2e/playwright-report/
  apps/e2e/test-results/
```

---

### Pitfall 5: reuseExistingServer conflicts in CI

**What goes wrong:** Playwright reuses a server left over from a previous step (or tries to); the server has stale env vars.

**Why it happens:** `reuseExistingServer: !process.env.CI` — but `CI` is set by GitHub Actions automatically, so this resolves to `false` in CI (good). No action needed, just noting that the existing config is already correct.

**Status:** Already handled in `playwright.config.ts`. No change needed.

---

## Code Examples

### Complete workflow YAML draft

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    env:
      # DynamoDB Local (hardcoded — testcontainers starts container on this port)
      AWS_REGION: us-east-1
      LOCAL_DYNAMODB_URL: http://localhost:8000
      DYNAMODB_TABLE: packpixie-test

      # Server URLs (hardcoded — Playwright webServer starts these locally)
      BASE_URL: http://localhost:5173
      VITE_API_URL: http://localhost:3001
      VITE_APP_VERSION: test

      # Cognito — API reads bare names; Vite client reads VITE_ prefixed names.
      # Both pairs use the same two secrets.
      COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
      COGNITO_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
      VITE_COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
      VITE_COGNITO_USER_POOL_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}

      # Test user credentials
      TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
      TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.19.0'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.12.1

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build model package
        # Required: @packpixie/e2e has no workspace deps so Turbo's ^build skips model.
        # API and client dev servers import from packages/model/dist/ — must exist first.
        run: pnpm --filter model build

      - name: Install Playwright browsers
        run: pnpm --filter @packpixie/e2e run install:browsers

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: |
            apps/e2e/playwright-report/
            apps/e2e/test-results/
          retention-days: 7
```

### Required playwright.config.ts change (CI reporter)

Change the `reporter` field so HTML output is generated in CI:

```typescript
// Before (current)
reporter: process.env.CI
  ? 'github'
  : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

// After (required for D-05)
reporter: process.env.CI
  ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
  : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | testcontainers (DynamoDB Local) | ✓ [ASSUMED] | pre-installed | — |
| pnpm 10.12.1 | install step | ✓ | via pnpm/action-setup@v4 | — |
| Node.js 22.19.0 | all steps | ✓ | via actions/setup-node@v4 | — |
| Chromium + OS deps | Playwright tests | ✓ | via `playwright install --with-deps` | — |
| GitHub secrets (4) | Cognito auth | must be configured by admin | — | none (blocks CI) |

**Missing dependencies with no fallback:**
- GitHub repository secrets (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`) — must be added by a repository admin in Settings → Secrets → Actions before the workflow can pass.

---

## Deliverables Summary

| File | Action | Reason |
|------|--------|--------|
| `.github/workflows/e2e.yml` | Create | CI-01 through CI-05 |
| `apps/e2e/playwright.config.ts` | Edit (reporter field only) | D-05: HTML report requires array reporter in CI |
| `apps/e2e/README.md` | Update | D-03: document secrets setup for repo admins |

---

## Sources

### Primary (HIGH confidence — verified against actual project files)
- `apps/e2e/src/config.ts` — all `required()` calls
- `apps/e2e/playwright.config.ts` — reporter config, outputDir, webServer commands
- `apps/e2e/package.json` — browser install script, package name
- `apps/api/src/index.ts` + `apps/api/src/lib/dynamodb.ts` — API env var consumption
- `apps/client/src/config.ts` — Vite VITE_ var names
- `.github/workflows/lint.yml` — action versions, pnpm install command
- `turbo.json` — e2e task dependsOn
- `packages/model/package.json` — build script

### Tertiary (LOW confidence — training knowledge)
- Docker availability on ubuntu-latest [ASSUMED]
- Ryuk behavior on GitHub Actions [ASSUMED]
- `actions/upload-artifact@v4` being current standard [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Docker is pre-installed on ubuntu-latest with socket at /var/run/docker.sock | Q1 | testcontainers fails to start; DynamoDB Local never starts; all tests fail |
| A2 | Ryuk reaper works on ubuntu-latest without TESTCONTAINERS_RYUK_DISABLED | Q9 | containers may not clean up (non-blocking on ephemeral runners) |
| A3 | `actions/upload-artifact@v4` is the current major version | Q8 | action may not exist; use v3 as fallback |

**Mitigation for A1:** If Docker is not available, add a `docker info` verification step early in the job to surface the error clearly instead of a cryptic Playwright timeout.

---

**Research date:** 2026-06-29
**Valid until:** 2026-09-01 (GitHub Actions runner images change quarterly)
