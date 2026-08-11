# Retrospective

## Milestone: v1.0 — E2E Testing Infrastructure

**Shipped:** 2026-08-11
**Phases:** 4 | **Plans:** 4

### What Was Built
Playwright E2E infrastructure for packPixie: an `apps/e2e` workspace package, full-stack test orchestration (DynamoDB Local via testcontainers + Fastify API + Vite + real Cognito login), a GitHub Actions pipeline, and two baseline specs (auth smoke + trip create→list) that run green locally and in CI.

### What Worked
- Splitting into foundation → orchestration → CI → tests kept each phase independently verifiable.
- Reading config from `.env.test` in-process (Playwright) rather than relying on inherited env sidestepped a whole class of environment-propagation problems.
- Sourcing Cognito IDs and the test-user credentials from AWS Secrets Manager (with the user provisioned by Terraform) gave one credential source for both local and CI, needing only AWS keys as GitHub secrets.

### What Was Inefficient
- The suite passed locally but failed in CI three distinct times, each a variant of the same root cause: **Turbo 2.5 strict env mode strips undeclared variables** from the spawned dev servers (missing table name → missing AWS creds → API 500). Local runs masked it via ambient `~/.aws` credentials and a gitignored `.env.test`. Cost several diagnose→fix→push cycles.
- Verification bookkeeping lagged the implementation: phases 2–4 shipped code but their VERIFICATION reports were missing/blocked, so STATE.md claimed "complete" while GSD's own gate did not. Closed out retroactively.
- The GSD framework itself was committed before being recognized as an installed tool; had to be untracked and gitignored after the fact.

### Patterns Established
- Local-DynamoDB clients must pin dummy credentials (`accessKeyId: 'local'`) rather than lean on the default provider chain — see `apps/api/src/lib/dynamodb.ts` and `apps/e2e/src/db/init.ts`.
- Anything the Playwright webServers need at runtime belongs in `.env.test` (loaded in-process), not job-level env, because of Turbo's env sandbox (tracked in issue #13).
- Cleanup is part of a change: when something becomes obsolete (secrets, tracked tool files, stale docs), remove it in the same change (recorded as a convention in CLAUDE.md).

### Key Lessons
- "Passes on my machine" for E2E often means it silently used ambient local state (credentials, dotfiles). Prove parity by making the test path self-contained.
- A green implementation is not a closed phase — keep verification/UAT in step with the code, or reconcile explicitly at milestone close.

### Follow-ups Opened
- #13 — decouple the API/client dev servers from Turbo's env sandbox.
- #14 — bump GitHub Actions off the deprecated Node 20 runtime.

## Cross-Milestone Trends

_(First milestone — trends accumulate here as future milestones ship.)_
