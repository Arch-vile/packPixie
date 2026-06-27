# Project State

**Project:** PackPixie E2E Testing Infrastructure
**Initialized:** 2026-06-27
**Current phase:** Phase 1 (not started)

## Active Work

None — ready to start Phase 1.

## Phase History

| Phase | Status | Completed |
|-------|--------|-----------|
| Phase 1: Playwright Package Foundation | Not started | — |
| Phase 2: Stack Orchestration + DB Init | Not started | — |
| Phase 3: GitHub Actions CI Pipeline | Not started | — |
| Phase 4: Baseline E2E Tests | Not started | — |

## Open Questions

- Cognito test user must be created manually before Phase 2 UAT; document clearly in README
- Confirm `LOCAL_DYNAMODB_URL=http://localhost:8000` is the expected port for DynamoDB Local Docker image

## Decisions Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-06-27 | DynamoDB Local (Docker) for test DB | No AWS credentials needed, zero cost, fully isolated |
| 2026-06-27 | Real Cognito test user for auth | Tests exercise real auth flow end-to-end |
| 2026-06-27 | `apps/e2e` workspace package | Consistent with monorepo structure |
| 2026-06-27 | GitHub Actions for CI | Native GitHub integration |
| 2026-06-27 | Playwright over Cypress | Better TypeScript/ESM support, native parallelism |

---
*Last updated: 2026-06-27 after initialization*
