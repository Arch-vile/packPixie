---
phase: 03-github-actions-ci-pipeline
verified: 2026-08-11T12:40:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: GitHub Actions CI Pipeline Verification Report

**Phase Goal:** The E2E suite runs automatically on push to `main` and on PRs via GitHub Actions, with DynamoDB Local available in the job and Cognito credentials injected securely from secrets.
**Verified:** 2026-08-11T12:40:00Z
**Status:** passed
**Re-verification:** No — initial verification (report was missing; phase deliverable otherwise complete)

## Goal Achievement

The phase goal is proven by **authoritative runtime evidence**: the `E2E Tests` workflow ran GREEN on the current branch head and on `main`. Run `31490461698` (event: `push`, ref: `main`, merge of PR #12) reported `2 passed (19.7s)` — both Playwright specs (`auth.spec.ts` + `trip.spec.ts`) passed. Multiple consecutive green PR-triggered runs also exist (`31489923845`, `31488513824`, `31487145311`, `31485157850`). A green run is only possible if every link in the chain works: env provisioning, model build, browser install, DynamoDB Local (testcontainers), Cognito auth, and the full suite. This runtime evidence supersedes any static-analysis doubt.

**Note on implementation evolution:** The delivered workflow evolved from the plan/ROADMAP wording. The plan specified the four Cognito values as direct GitHub-secret env vars at job level; the shipped workflow instead configures AWS credentials (the only GitHub secrets) and runs `apps/e2e/setup-env.sh`, which reads the Cognito IDs and test-user credentials from AWS Secrets Manager (`pack-pixie/*`) into `apps/e2e/.env.test`. This is an intentional, documented improvement (fewer GitHub secrets, single source of truth aligned with the deploy workflows) recorded in `e2e.yml` comments and `apps/e2e/README.md`. The goal-level intent — sensitive Cognito credentials injected securely and reaching the API/client webServers — is fully achieved and proven by the green auth spec. Verification is assessed goal-backward against this current implementation, as directed.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | E2E workflow triggers on push to `main` and on PRs targeting `main` (D-01, CI-01) | VERIFIED | `.github/workflows/e2e.yml` lines 3-7 (`on: push: branches: [main]` + `pull_request: branches: [main]`). Green runs observed for both a `push` to `main` (`31490461698`) and `pull_request` events. |
| 2 | DynamoDB Local starts via testcontainers — no `services:` block (D-02, CI-02) | VERIFIED | No `services:` block in `e2e.yml`; DynamoDB started by `global-setup.ts` (Phase 2). Green run's suite exercises DynamoDB — passing is proof it was reachable. |
| 3 | All required env vars present; sensitive Cognito values injected securely (not hardcoded) (D-03/D-09, CI-03) | VERIFIED | Mechanism evolved: `Configure AWS credentials` step (`e2e.yml` L35-40) + `setup-env.sh` reads 4 Cognito/test-user secrets from Secrets Manager and writes `.env.test` (both API `COGNITO_*` and `VITE_COGNITO_*` names, L49-54). Non-secret defaults come from `.env.example`. Green run proves all vars present and correct — webServers started and `auth.spec.ts` authenticated. |
| 4 | Playwright HTML report always written and uploaded with 7-day retention (D-05, CI-04) | VERIFIED | `playwright.config.ts` L30-32 CI reporter is array form `[['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]` (writes HTML to disk). `e2e.yml` L56-64 `upload-artifact@v4` with `if: always()` and `retention-days: 7`, uploading `playwright-report/` + `test-results/`. |
| 5 | README documents the required secrets/sources and the branch-protection requirement | VERIFIED | `apps/e2e/README.md`: `## Setting up CI` (L66), required GitHub secrets `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (L70-74), the four Cognito values sourced from Secrets Manager `pack-pixie/*` (L31-34, L77), and `### Branch protection` (L79-83) documenting the `E2E Tests / e2e` required status check. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/e2e.yml` | Full CI pipeline | VERIFIED | 64 lines; correct triggers, Node 22.19.0 / pnpm 10.12.1 (mirrors `lint.yml`), model build, AWS creds + setup-env, browser install, test run, always-upload artifact. Proven executable by green runs. |
| `apps/e2e/playwright.config.ts` | CI reporter array form | VERIFIED | L30-32 array form enables HTML output on CI (grep count = 1). |
| `apps/e2e/README.md` | `Setting up CI` section | VERIFIED | Section present (L66) with secrets, sources, and branch-protection steps. |
| `apps/e2e/setup-env.sh` | Secrets Manager → `.env.test` provisioning | VERIFIED | Reads 4 `pack-pixie/*` secrets, portable `sed` for Linux CI, writes API + VITE_ Cognito names. Invoked by workflow L47-48. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| CI reporter array form | `playwright-report/` on disk → upload-artifact | `html` reporter `open: 'never'` | WIRED | Reporter writes report; upload step path matches `apps/e2e/playwright-report/`. Green run produced an uploadable artifact. |
| Cognito secrets | Amplify/API authenticate | `setup-env.sh` → `.env.test` → webServer env | WIRED (evolved) | Was "job-level VITE_ secret mapping" in plan; now Secrets Manager → `.env.test`. `auth.spec.ts` passing in CI proves credentials reached the client and authenticated. |
| `pnpm --filter model build` | `packages/model/dist/` | webServers import `@packpixie/model` | WIRED | Build step at `e2e.yml` L30-31; green run's webServers started without crashing, proving `dist/` present. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CI-01 | 03-PLAN | Workflow runs on push to `main` + PRs | SATISFIED | `e2e.yml` L3-7; green runs on both event types. |
| CI-02 | 03-PLAN | DynamoDB Local available in CI job | SATISFIED | testcontainers per D-02 (supersedes "service container" wording); green suite exercises DB. |
| CI-03 | 03-PLAN | Cognito credentials injected from secrets | SATISFIED | Evolved: AWS-cred GitHub secrets + Secrets Manager via `setup-env.sh`; green auth spec proves injection works. |
| CI-04 | 03-PLAN | Playwright artifacts uploaded | SATISFIED | `upload-artifact@v4` with `if: always()` (covers failure and success), 7-day retention. |
| CI-05 | 03-PLAN (deferred) | Cache pnpm store + Playwright browsers | DEFERRED | Explicitly deferred per CONTEXT.md D-04 ("None — keep the workflow simple"); ROADMAP cache UAT criterion superseded. Not a gap. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | No `TBD`/`FIXME`/`XXX`/placeholder markers in `e2e.yml`, `setup-env.sh`, `playwright.config.ts`, or `README.md`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full E2E suite runs green in CI | `gh run view 31490461698 --log` | `Running 2 tests using 1 worker` → `2 passed (19.7s)` | PASS |
| Workflow triggers on both events | `gh run list --workflow=e2e.yml` | Green `push` (main) + green `pull_request` runs present | PASS |

### Human Verification Required

None blocking — the phase goal is proven by authoritative green CI runs.

**Operational note (informational, out of code-deliverable scope):** Whether the `E2E Tests / e2e` check is actually enabled as a *required* status check lives in GitHub repository Settings → Branches (external ops config, not the workflow file). The phase deliverable was to *document* this requirement, which is verified in `README.md` (L79-83). Confirm the branch-protection toggle is enabled in GitHub settings if not already done.

### Gaps Summary

No gaps. All five must-have truths are verified, all artifacts exist and are substantive, all key links are wired, and the full pipeline is proven working by multiple green CI runs (2/2 Playwright specs passing). The shipped implementation deviates from the plan's literal secret-provisioning mechanism (Secrets Manager via `setup-env.sh` rather than direct GitHub-secret env vars) and from the ROADMAP's "service container" / caching wording — but these are intentional, documented evolutions (D-02 for DynamoDB, D-04 caching deferral, and the later Secrets-Manager fix). Each achieves or supersedes the original intent, and the goal-level behavior is confirmed at runtime. Phase goal achieved.

---

_Verified: 2026-08-11T12:40:00Z_
_Verifier: Claude (gsd-verifier)_
