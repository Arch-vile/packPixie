# Phase 3 Summary: GitHub Actions CI Pipeline

**Status:** Complete  
**Date:** 2026-06-29  
**Commits:** 147c853, c8d8753, 2f2405b

---

## Goal

Wire the full E2E suite into GitHub Actions so that every push to `main` and every PR targeting `main` automatically runs the Playwright suite, starts DynamoDB Local via testcontainers, authenticates against the real Cognito pool, and uploads the HTML report as an artifact.

---

## What was built

| File | Change | Purpose |
|------|--------|---------|
| `apps/e2e/playwright.config.ts` | Reporter changed from `'github'` (string) to `[['github'], ['html', ...]]` | Enables HTML report file on CI so upload-artifact has content |
| `.github/workflows/e2e.yml` | Created (64 lines) | Full CI pipeline: triggers, env, build, test, upload |
| `apps/e2e/README.md` | Added `## Setting up CI` section | Documents 4 secrets + sources + branch protection |

---

## Key decisions implemented

| Decision | Implementation |
|----------|---------------|
| D-01: push+PR triggers | `on: push: branches: [main]` + `pull_request: branches: [main]` |
| D-02: testcontainers (no services:) | No `services:` block; global-setup.ts starts DynamoDB Local automatically |
| D-03: GitHub secrets | 4 secrets at job `env:` level so webServer child processes inherit them |
| D-04: no caching | No cache steps in workflow |
| D-05: always upload, 7 days | `if: always()`, `retention-days: 7` |
| D-06: ubuntu-latest | `runs-on: ubuntu-latest` |
| D-07: Node 22.19.0, pnpm 10.12.1 | `setup-node@v4` + `pnpm/action-setup@v4` matching lint.yml |
| D-08: `.github/workflows/e2e.yml` | File location per decision |
| D-09: VITE_ dual mapping | `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID` mapped from same two secrets as API vars |

---

## Requirements coverage

| Requirement | Status | How |
|-------------|--------|-----|
| CI-01: workflow triggers | ✅ | push to main + PR targeting main |
| CI-02: DynamoDB accessible | ✅ | testcontainers (supersedes "service container" wording in req) |
| CI-03: secrets injected | ✅ | 4 secrets at job env level; `required()` guards fire immediately on missing values |
| CI-04: report artifact | ✅ | `upload-artifact@v4` always, 7-day retention, HTML + test-results |
| CI-05: caching | ⏭ Deferred | Deferred per D-04; add in a future phase if run time becomes unacceptable |

---

## Verification results (all pass)

- `[['github'], ['html',...]]` reporter: ✅ (1 match)
- `pull_request` trigger: ✅
- No `services:` block: ✅
- `pnpm --filter model build` step: ✅
- `install:browsers` step: ✅
- `upload-artifact@v4`: ✅
- `if: always()`: ✅
- `retention-days: 7`: ✅
- `Setting up CI` README section: ✅
- `VITE_COGNITO_USER_POOL_CLIENT_ID` dual mapping: ✅
- All 12 env vars present: ✅ (12/12)

---

## Deferred

- **CI-05 (caching):** Deferred per CONTEXT.md D-04. ROADMAP.md Phase 3 caching UAT criterion is superseded by D-04. Add pnpm store and Playwright browser caching in a future phase if CI run time becomes a concern.

---

## Next phase

**Phase 4: Baseline E2E Tests**
- `apps/e2e/tests/auth.spec.ts` — login smoke test
- `apps/e2e/tests/trip.spec.ts` — core flow (create trip → add item → verify)
- `apps/e2e/src/fixtures/` — shared authenticated page fixtures
