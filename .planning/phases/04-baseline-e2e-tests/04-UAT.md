---
status: testing
phase: 04-baseline-e2e-tests
source: [04-VERIFICATION.md]
started: 2026-08-10T14:20:00Z
updated: 2026-08-10T15:45:00Z
---

## Current Test

number: 2
name: Confirm a green GitHub Actions e2e.yml run on the branch/PR (TEST-03)
expected: |
  The same two specs pass in CI with no code changes between local and CI.
awaiting: user response

## Tests

### 1. Run `cd apps/e2e && pnpm e2e` locally with Docker + configured .env.test (TEST-01, TEST-02)
expected: auth.spec.ts asserts the signed-in label shows the test user email; trip.spec.ts creates a trip via UI (POST /api/trips) and sees it in the list; both pass, exit 0.
result: pass — 2 passed (9.3s), exit 0, on 2026-08-10 after the -sharedDb fix (d355e68). Initial run failed with POST /api/trips 500 "non-existent table" (DynamoDB Local namespace split); fixed and re-run green.

### 2. Confirm a green GitHub Actions e2e.yml run on the branch/PR (TEST-03)
expected: The same two specs pass in CI with no code changes between local and CI.
result: [pending]

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
