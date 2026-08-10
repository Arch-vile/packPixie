---
status: testing
phase: 04-baseline-e2e-tests
source: [04-VERIFICATION.md]
started: 2026-08-10T14:20:00Z
updated: 2026-08-10T14:20:00Z
---

## Current Test

number: 1
name: Run `cd apps/e2e && pnpm e2e` locally with Docker + configured .env.test (TEST-01, TEST-02)
expected: |
  globalSetup starts DynamoDB Local and creates the table (no seed step), logs in the
  Cognito test user and saves .auth/user.json. auth.spec.ts asserts the signed-in label
  shows the test user email; trip.spec.ts creates a trip via the UI (POST /api/trips) and
  sees it in the list. Exactly 2 tests pass, exit code 0.
awaiting: user response

## Tests

### 1. Run `cd apps/e2e && pnpm e2e` locally with Docker + configured .env.test (TEST-01, TEST-02)
expected: auth.spec.ts asserts the signed-in label shows the test user email; trip.spec.ts creates a trip via UI (POST /api/trips) and sees it in the list; both pass, exit 0.
result: [pending]

### 2. Confirm a green GitHub Actions e2e.yml run on the branch/PR (TEST-03)
expected: The same two specs pass in CI with no code changes between local and CI.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
