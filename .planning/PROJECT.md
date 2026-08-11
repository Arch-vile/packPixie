# PackPixie E2E Testing Infrastructure

## What This Is

Playwright end-to-end testing infrastructure for the packPixie application — a collaborative trip packing web app. This project adds the full testing plumbing: a dedicated `apps/e2e` workspace package, DynamoDB Local for isolated test data, server orchestration scripts, and a GitHub Actions CI pipeline. Tests run against a live application stack (Fastify API + React client + DynamoDB Local) both locally and in CI.

## Core Value

Any developer can run `pnpm test:e2e` and get a reliable green/red signal against a real, fully initialized application stack.

## Current Milestone: v2.0 Packing Table MVP

**Goal:** A participant can open a trip and manage its shared packing table — the first genuinely usable slice of the actual PackPixie product.

**Target features:**
- Enter a trip (trip detail page) with a single-query load of trip meta, participants, and items
- Item table CRUD: Name, Quantity, Weight, PackedBy, Status, Category, Consumable
- Packing view defaulting to `PackedBy = me`, with a status filter and show-all toggle
- Shared editing (any participant edits any row) with cheap correctness rules
- Remove the leftover `Comments` scaffold; extend E2E coverage to the item table

**Deferred to later milestones:** UsedBy / usage sets · Distribution + fairness algorithm · copy-a-trip reuse flow · Summary section · cross-user edit confirmation · full filter bar + search

## Context

- **Existing stack**: Fastify 5 API (Lambda in prod / HTTP locally), React 19 + Vite client, DynamoDB single-table, Cognito auth — all in a pnpm + Turbo monorepo
- **No tests exist today** — this is a greenfield testing layer on top of a working application
- **Auth**: The app requires Cognito JWT authentication on all protected routes; E2E tests will use a dedicated real Cognito test user with credentials stored as CI secrets
- **Database**: DynamoDB Local (Docker) provides a fresh, isolated table per test run — no AWS charges, no cross-run contamination
- **CI target**: GitHub Actions with DynamoDB Local as a service container
- **Local dev**: Tests should run locally with a single command; Docker required for DynamoDB Local
- **Current state**: v1.0 shipped 2026-08-11 (PR #12 merged to `main`) — 2 Playwright specs (auth smoke + trip create→list) run green locally and in GitHub Actions. Credentials flow through AWS Secrets Manager (`setup-env.sh`); the GSD framework is a local-only dev tool (gitignored).

## Requirements

### Validated

- ✓ `apps/e2e` workspace package with Playwright configured (TypeScript, ESM) — v1.0
- ✓ pnpm workspace recognizes `apps/e2e`; `pnpm test:e2e` runs from repo root — v1.0
- ✓ DynamoDB Local starts before tests and is torn down after — v1.0 (via testcontainers, not a raw Docker service)
- ✓ Global setup creates the required DynamoDB table — v1.0 (seeding dropped — tests self-provision through the UI)
- ✓ Global teardown is idempotent across reruns — v1.0
- ✓ Fastify API starts in test mode pointing at DynamoDB Local — v1.0
- ✓ Vite dev server starts in test mode pointing at local API — v1.0
- ✓ Tests authenticate using a real Cognito test user — v1.0 (user provisioned by Terraform; creds read from AWS Secrets Manager)
- ✓ GitHub Actions runs the E2E suite on push to `main` and on PRs — v1.0
- ✓ CI uses DynamoDB Local via testcontainers (no real AWS DynamoDB) — v1.0
- ✓ Cognito test-user credentials sourced securely in CI — v1.0 (Secrets Manager via setup-env.sh; only AWS creds are GitHub secrets)
- ✓ Smoke test covers the core happy path (create trip → verify in list) — v1.0 ("add item" dropped — no item API in v1)
- ✓ Tests pass both locally and in CI without code changes — v1.0

### Active

<!-- v2.0 Packing Table MVP — formalized with REQ-IDs in REQUIREMENTS.md -->

- [ ] Participant can open a trip and view its packing table (single-query load)
- [ ] Participant can add, edit, and delete item rows (Name, Quantity, Weight, PackedBy, Status, Category, Consumable)
- [ ] New rows default PackedBy to the current user
- [ ] Packing view defaults to `PackedBy = me` with a status filter and a show-all toggle
- [ ] Any participant can edit any row; `packed` requires PackedBy; clearing PackedBy resets Status
- [ ] Remove the `Comments` scaffold (endpoint + client component)
- [ ] E2E suite covers the item table happy path

### Out of Scope

- Unit tests or component tests — this project is E2E plumbing only
- Mocking Cognito — real test user is the chosen approach
- AWS DynamoDB in CI — DynamoDB Local covers all test scenarios
- Performance or load testing — functional E2E only

## Key Decisions

| Decision                                               | Rationale                                                                             | Outcome   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------- |
| DynamoDB Local (Docker) over AWS test table            | No AWS credentials needed in CI, zero cost, fully isolated, reproducible              | ✓ Good |
| Real Cognito test user over auth bypass                | Tests exercise the real auth flow end-to-end; bypass would miss JWT verification bugs | ✓ Good |
| `apps/e2e` workspace package over root-level directory | Consistent with monorepo structure; can have its own deps, tsconfig, and scripts      | ✓ Good |
| GitHub Actions for CI                                  | Project is on GitHub; native integration, no extra infra                              | ✓ Good |
| Playwright over Cypress                                | Better TypeScript support, ESM native, parallel workers, network interception         | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-08-11 after starting milestone v2.0 Packing Table MVP_
