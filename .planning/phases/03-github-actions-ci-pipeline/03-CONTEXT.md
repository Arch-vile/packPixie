---
phase: 03-github-actions-ci-pipeline
type: context
status: complete
---

# Phase 3 Context: GitHub Actions CI Pipeline

## Phase goal

Add a GitHub Actions workflow that runs the full E2E suite on every push to `main` and every PR targeting `main`. The workflow must be a required status check — PRs cannot merge if E2E fails.

## Locked decisions

### D-01: Trigger strategy
`push` to `main` + `pull_request` targeting `main`. Matches the existing `lint.yml` pattern.
E2E is a required status check (configured in GitHub branch protection, not the workflow file itself — document this in README).

### D-02: DynamoDB Local in CI
Use **testcontainers at runtime** — same code path as local dev. The `global-setup.ts` file starts the container automatically; no `services:` block needed in the workflow. This keeps local and CI identical and avoids divergence.

### D-03: Cognito auth in CI
Use **real Cognito** — same test user as local. The four secrets must be added to GitHub repository secrets:
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `TEST_USER_EMAIL`
- `TEST_USER_PASSWORD`

The workflow injects them as environment variables. No mocking or stubbing.

### D-04: Caching
**None** — keep the workflow simple. Do not add pnpm store cache or Playwright browser cache. If run time becomes a problem, add caching in a future phase.

### D-05: Playwright artifacts
**Always upload** the Playwright HTML report (screenshots + traces) regardless of pass/fail.
Retention: **7 days**.

### D-06: Node.js + pnpm versions
Match existing workflows exactly:
- Node.js: `22.19.0` (from `lint.yml`)
- pnpm: `10.12.1` (from `lint.yml`, via `pnpm/action-setup@v4`)

### D-07: Workflow file location
`.github/workflows/e2e.yml` — consistent with existing `lint.yml`, `deploy-api.yml`, `deploy-client.yml`.

### D-08: Job runner
`ubuntu-latest` — matches existing workflows. Docker is available on ubuntu-latest runners, required for testcontainers.

### D-09: Environment variables in CI
The workflow must set all required vars from secrets. The `src/config.ts` `required()` helper will throw immediately if any is missing. Required vars:
```
COGNITO_USER_POOL_ID    → ${{ secrets.COGNITO_USER_POOL_ID }}
COGNITO_CLIENT_ID       → ${{ secrets.COGNITO_CLIENT_ID }}
TEST_USER_EMAIL         → ${{ secrets.TEST_USER_EMAIL }}
TEST_USER_PASSWORD      → ${{ secrets.TEST_USER_PASSWORD }}
DYNAMODB_TABLE          → packpixie-test (hardcoded in workflow, not a secret)
LOCAL_DYNAMODB_URL      → http://localhost:8000 (hardcoded)
AWS_REGION              → us-east-1 (hardcoded, or from secrets if it varies)
BASE_URL                → http://localhost:5173 (hardcoded)
VITE_API_URL            → http://localhost:3001 (hardcoded)
VITE_APP_VERSION        → test (hardcoded)
```
No `.env.test` file is used in CI — all vars come from the workflow `env:` block.

## Build steps order

1. Checkout
2. Setup Node.js 22.19.0
3. Setup pnpm 10.12.1
4. Install dependencies (`pnpm install --frozen-lockfile`)
5. Build model package (`pnpm --filter model build`) — required before e2e (model is a workspace dep)
6. Install Playwright browsers (`pnpm --filter @packpixie/e2e exec playwright install --with-deps chromium`)
7. Run E2E (`pnpm test:e2e`)
8. Upload Playwright report (always, 7-day retention)

## Existing workflow patterns to reuse

File: `.github/workflows/lint.yml`
- `actions/checkout@v4`
- `actions/setup-node@v4` with `node-version: '22.19.0'`
- `pnpm/action-setup@v4` with `version: 10.12.1`
- `pnpm install --frozen-lockfile`
- `runs-on: ubuntu-latest`

## Deferred ideas

- pnpm store + Playwright browser caching (add if CI run time >5 min)
- Matrix testing across multiple browsers
- Slack/email notification on E2E failure
- Scheduled nightly E2E run against staging environment

## Files to create/modify

| File | Action |
|------|--------|
| `.github/workflows/e2e.yml` | Create |
| `apps/e2e/README.md` | Update — add CI secrets setup instructions |
