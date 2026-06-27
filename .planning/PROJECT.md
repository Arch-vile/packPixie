# PackPixie E2E Testing Infrastructure

## What This Is

Playwright end-to-end testing infrastructure for the packPixie application — a collaborative trip packing web app. This project adds the full testing plumbing: a dedicated `apps/e2e` workspace package, DynamoDB Local for isolated test data, server orchestration scripts, and a GitHub Actions CI pipeline. Tests run against a live application stack (Fastify API + React client + DynamoDB Local) both locally and in CI.

## Core Value

Any developer can run `pnpm test:e2e` and get a reliable green/red signal against a real, fully initialized application stack.

## Context

- **Existing stack**: Fastify 5 API (Lambda in prod / HTTP locally), React 19 + Vite client, DynamoDB single-table, Cognito auth — all in a pnpm + Turbo monorepo
- **No tests exist today** — this is a greenfield testing layer on top of a working application
- **Auth**: The app requires Cognito JWT authentication on all protected routes; E2E tests will use a dedicated real Cognito test user with credentials stored as CI secrets
- **Database**: DynamoDB Local (Docker) provides a fresh, isolated table per test run — no AWS charges, no cross-run contamination
- **CI target**: GitHub Actions with DynamoDB Local as a service container
- **Local dev**: Tests should run locally with a single command; Docker required for DynamoDB Local

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] `apps/e2e` workspace package exists with Playwright configured (TypeScript, ESM)
- [ ] pnpm workspace recognizes `apps/e2e`; `pnpm test:e2e` runs from repo root
- [ ] DynamoDB Local starts via Docker before tests and is torn down after
- [ ] Global Playwright setup creates the required DynamoDB table and seeds minimum test data
- [ ] Global teardown clears all test data (idempotent across reruns)
- [ ] Fastify API starts in test mode pointing at DynamoDB Local
- [ ] Vite dev server starts in test mode pointing at local API
- [ ] Tests authenticate using a real Cognito test user (credentials via env vars)
- [ ] GitHub Actions workflow runs E2E suite on push to `main` and on PRs
- [ ] CI uses DynamoDB Local as a service container (no real AWS DynamoDB in CI)
- [ ] Cognito test user credentials are stored as GitHub Actions secrets
- [ ] At least one smoke test covers the core happy path (create trip → add item → verify list)
- [ ] Tests pass both locally and in CI without code changes

### Out of Scope

- Unit tests or component tests — this project is E2E plumbing only
- Mocking Cognito — real test user is the chosen approach
- AWS DynamoDB in CI — DynamoDB Local covers all test scenarios
- Performance or load testing — functional E2E only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| DynamoDB Local (Docker) over AWS test table | No AWS credentials needed in CI, zero cost, fully isolated, reproducible | — Pending |
| Real Cognito test user over auth bypass | Tests exercise the real auth flow end-to-end; bypass would miss JWT verification bugs | — Pending |
| `apps/e2e` workspace package over root-level directory | Consistent with monorepo structure; can have its own deps, tsconfig, and scripts | — Pending |
| GitHub Actions for CI | Project is on GitHub; native integration, no extra infra | — Pending |
| Playwright over Cypress | Better TypeScript support, ESM native, parallel workers, network interception | — Pending |

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
*Last updated: 2026-06-27 after initialization*
