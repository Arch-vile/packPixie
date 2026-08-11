---
phase: 04-baseline-e2e-tests
verified: 2026-08-10T14:20:00Z
status: human_needed
score: 5/6 must-haves verified
behavior_unverified: 1 # "pnpm e2e exits 0" — suite present + fully wired, but not executable here (no Docker / Cognito test user)
overrides_applied: 0
behavior_unverified_items:
  - truth: "pnpm e2e exits 0 — both auth.spec.ts and trip.spec.ts pass"
    test: "With Docker running and a configured .env.test (real Cognito test user), run `cd apps/e2e && pnpm e2e`"
    expected: "globalSetup starts DynamoDB Local, creates the table (no seed step), logs in the Cognito user; exactly 2 tests pass (auth.spec.ts + trip.spec.ts); exit code 0"
    why_human: "Requires Docker + a live Cognito test user + gitignored .env.test. Docker is unavailable in this verification environment, so runtime pass/fail cannot be observed statically."
human_verification:
  - test: "Run `cd apps/e2e && pnpm e2e` locally with Docker + configured .env.test (TEST-01, TEST-02)"
    expected: "auth.spec.ts asserts the signed-in label shows the test user email; trip.spec.ts creates a trip via UI (POST /api/trips) and sees it in the list; both pass, exit 0"
    why_human: "Full-stack browser run requires Docker (DynamoDB Local) and a real Cognito session; cannot be exercised without those services."
  - test: "Confirm a green GitHub Actions e2e.yml run on the branch/PR (TEST-03)"
    expected: "The same two specs pass in CI with no code changes between local and CI"
    why_human: "Requires an actual CI run with injected secrets; not observable from the codebase alone."
---

# Phase 04: Baseline E2E Tests Verification Report

**Phase Goal:** A meaningful smoke test suite exists that exercises the core happy path end-to-end through a real browser.
**Verified:** 2026-08-10T14:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (close-out under safe_resume_gate)

## Goal Achievement

The suite EXISTS, is substantive, and is fully wired end-to-end (browser → Vite → Fastify → DynamoDB and back to the rendered list). Every static must-have is satisfied. The one thing that cannot be proven in this environment is that the suite actually RUNS GREEN — that is behavior-dependent and requires Docker + a Cognito test user, neither available here. Per instruction, runtime pass/fail is routed to human verification rather than asserted.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pnpm e2e` exits 0 — both specs pass | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Specs present + fully wired, but Docker unavailable and no Cognito .env.test — suite cannot be executed here (see Human Verification) |
| 2 | global-setup.ts has zero references to the seed module | ✓ VERIFIED | `grep -ni seed apps/e2e/global-setup.ts` → no matches; file ends at Step 3 (login), no seed import/call |
| 3 | apps/e2e/src/db/seed.ts deleted from repo | ✓ VERIFIED | `test -f` → file absent; not tracked in git |
| 4 | App.tsx signed-in paragraph carries data-testid="signed-in-label" | ✓ VERIFIED | App.tsx:48 `<p className="signed-in-label" data-testid="signed-in-label">` (count 1) |
| 5 | TripList.tsx trip-name span carries data-testid="trip-name" | ✓ VERIFIED | TripList.tsx:158 `<span className="trip-name" data-testid="trip-name">` (count 1) |
| 6 | trip.spec.ts wraps Create click in Promise.all + waitForResponse | ✓ VERIFIED | trip.spec.ts:17-24 `const [response] = await Promise.all([ page.waitForResponse(POST /api/trips), Create.click() ])` |

**Score:** 5/6 truths verified (1 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/e2e/tests/auth.spec.ts` | Auth smoke test | ✓ VERIFIED | Imports from `../src/fixtures/index`; one test with two `getByTestId('signed-in-label')` assertions incl. `toContainText(config.auth.testUserEmail)` |
| `apps/e2e/tests/trip.spec.ts` | Trip create→list happy path | ✓ VERIFIED | Promise.all + waitForResponse on POST /api/trips; asserts `getByTestId('trip-name').filter({ hasText: tripName })` visible. Contains an uncommitted fail-fast diagnostic (throws on non-ok response) — benign refinement, not a stub |
| `apps/e2e/src/fixtures/index.ts` | Shared fixtures re-export | ✓ VERIFIED | `export const test = base.extend({}); export { expect };` — canonical import path established |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| auth.spec.ts + trip.spec.ts | src/fixtures/index.ts | `import { test, expect } from '../src/fixtures/index'` | ✓ WIRED | Both specs import from fixtures, not @playwright/test |
| getByTestId('signed-in-label') | App.tsx | data-testid on p.signed-in-label | ✓ WIRED | App.tsx:48 |
| getByTestId('trip-name') | TripList.tsx | data-testid on span.trip-name | ✓ WIRED | TripList.tsx:158 |
| waitForResponse POST /api/trips | Fastify createTrip → DynamoDB | client createTrip fetch → api.ts POST /trips → TransactWriteCommand | ✓ WIRED | client/src/api/api.ts:67 POST `${apiUrl}/api/trips`; api.ts:147 handler persists trip META + creator via TransactWriteCommand; GET /trips (api.ts:233) queries GSI1 and returns list |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| trip.spec.ts | `trip-name` list item | UI click → handleCreate (TripList.tsx:48) → createTrip POST → DynamoDB persist → getTrips() GET → onTripsChange → render | ✓ (full chain traced statically) | ✓ FLOWING (runtime green pending human) |
| auth.spec.ts | `signed-in-label` text | storageState session → App renders `Signed in as {userEmail}` | ✓ | ✓ FLOWING (runtime green pending human) |

Selectors used by the specs match live component labels: `+ New Trip` button (TripList.tsx:76), `Trip name` placeholder (TripList.tsx:85), `Create`/`Creating…` button (TripList.tsx:137).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Run E2E suite | `cd apps/e2e && pnpm e2e` | Docker not available in this environment | ? SKIP → human verification |

Step 7b: the only runnable behavior (the E2E suite itself) requires Docker + Cognito and cannot be executed here.

### Probe Execution

No project probes declared for this phase (`scripts/*/tests/probe-*.sh` not present). N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEST-01 | 04-PLAN | ≥1 smoke test: app loads + user can log in | ? NEEDS HUMAN | auth.spec.ts present + wired; login exercised via global-setup `loginAndSaveState`; runtime pass needs Docker+Cognito |
| TEST-02 | 04-PLAN | Core happy path: create trip → verify in list | ? NEEDS HUMAN | trip.spec.ts present + wired end-to-end; runtime pass needs full stack |
| TEST-03 | 04-PLAN | Tests pass in local AND CI without code changes | ? NEEDS HUMAN | .github/workflows/e2e.yml exists; green CI run needed to confirm |

All three requirement IDs from PLAN frontmatter are accounted for. No orphaned requirements — REQUIREMENTS.md maps TEST-01–03 to Phase 4 and all appear in the plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER in any phase-modified file | ℹ️ Info | None |
| apps/e2e/tests/trip.spec.ts | 27-32 | Uncommitted working-tree fail-fast diagnostic (`throw` on non-ok POST) | ℹ️ Info | Benign; improves failure messages. Matches SUMMARY note; not part of committed Phase 4 scope. Consider committing it. |
| .planning/REQUIREMENTS.md | 55-57, 92 | TEST-01–03 still marked `[ ]` / "Pending" | ⚠️ Warning | Traceability not propagated at close-out. Documentation gap, not a goal blocker. Reconcile after human confirms the suite runs green. |

### Human Verification Required

#### 1. Execute the E2E suite locally (TEST-01, TEST-02)

**Test:** With Docker running and a configured `.env.test` (real Cognito test user), run `cd apps/e2e && pnpm e2e`.
**Expected:** globalSetup starts DynamoDB Local + creates the table (no seed step) + logs in the Cognito user; exactly 2 tests pass (auth smoke + trip create→list); globalTeardown cleans up; exit code 0.
**Why human:** Requires Docker (DynamoDB Local), a live Cognito test user, and gitignored `.env.test`. Docker is unavailable in this verification environment.

#### 2. Confirm a green CI run (TEST-03)

**Test:** Confirm the `.github/workflows/e2e.yml` job passes on the branch/PR.
**Expected:** The same two specs pass in CI with no code changes between local and CI.
**Why human:** Requires an actual CI run with injected secrets; not observable from the codebase.

### Gaps Summary

No structural gaps. The baseline suite exists, is meaningful, and every selector/import/data-path is correctly wired from the browser through Fastify to DynamoDB and back to the rendered trip list. Seeded data is fully removed (seed.ts deleted, global-setup clean), the two data-testid selectors are present, the fixtures re-export establishes the canonical import path, and trip.spec.ts uses the correct Promise.all + waitForResponse pattern.

The single unresolved item is behavioral: whether `pnpm e2e` actually exits 0. That is unverifiable here because Docker and a Cognito test user are not available. It is routed to human verification rather than treated as a failure — consistent with the close-out instructions. Once a human (or CI) confirms a green run, this phase can move to `passed`; the REQUIREMENTS.md traceability rows for TEST-01–03 should be flipped from Pending to Complete at that point.

---

_Verified: 2026-08-10T14:20:00Z_
_Verifier: Claude (gsd-verifier)_
