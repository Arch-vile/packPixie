# Phase 1: Playwright Package Foundation - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a functional `apps/e2e` workspace package with Playwright installed and configured. The package must be recognized by pnpm, integrated into the Turbo pipeline, and runnable (`pnpm test:e2e` exits with "no tests found" rather than a config error). No server orchestration, no DB setup, no tests — just the scaffold. That is Phase 2's scope.

</domain>

<decisions>
## Implementation Decisions

### Browser Targets
- **D-01:** Playwright is configured for **Chromium only**. No cross-browser matrix. This keeps CI runs fast and focused. Other browsers can be added in v2 if cross-browser regressions are encountered.

### Turbo Task Design
- **D-02:** Create a dedicated `e2e` Turbo task — do NOT fold into the existing `test` task. The `e2e` task in `turbo.json` declares `"dependsOn": ["^build"]` so the shared `packages/model` package is built before Playwright runs.
- **D-03:** Root `package.json` gets a new `"test:e2e": "turbo run e2e"` script. This propagates the Turbo task down to `apps/e2e` where the local `e2e` script invokes Playwright.
- **D-04:** The existing `test` Turbo task and root `test` script are left untouched — they remain separate concerns.

### the agent's Discretion
- TypeScript config: use the same strict ESM conventions as `apps/api/tsconfig.json` (ES2022 target, ESNext modules, strict mode) — this was not discussed but should mirror the repo conventions. The planner decides the exact tsconfig shape.
- Playwright version: use latest stable `@playwright/test` at time of install.
- Artifact directories: `test-results/`, `playwright-report/` — standard Playwright defaults; add to `apps/e2e/.gitignore`.
- Package name: `@packpixie/e2e` — matches the monorepo naming convention.
- The `apps/e2e/tests/` directory is scaffolded empty (a `.gitkeep` or a placeholder spec is fine).
- Base URL default: `http://localhost:5173` (Vite dev server default). Override via `BASE_URL` env var.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Structure
- `.planning/ROADMAP.md` — Phase 1 deliverables and UAT criteria (source of truth for scope)
- `.planning/REQUIREMENTS.md` — PKG-01 through PKG-04 and PW-01 through PW-05

### Existing Package Conventions (mirror these)
- `apps/api/package.json` — monorepo package structure, ESM conventions
- `apps/api/tsconfig.json` — TypeScript config to mirror (strict, ESM, ES2022)
- `apps/client/package.json` — additional package structure reference
- `pnpm-workspace.yaml` — already includes `apps/*`; no change needed for `apps/e2e`
- `turbo.json` — existing task definitions to extend (add `e2e` task)
- `package.json` (root) — existing scripts to extend (add `test:e2e`)

</canonical_refs>

<specifics>
## Specific Implementation Notes

- `pnpm-workspace.yaml` already uses `apps/*` glob — `apps/e2e` is covered without any change
- Turbo `e2e` task: `{ "dependsOn": ["^build"], "cache": false }` — E2E tests should not be cached since they depend on runtime state
- The `e2e` script in `apps/e2e/package.json` should be: `"e2e": "playwright test"`
- Playwright config should NOT reference global setup/teardown yet — that is Phase 2

</specifics>

<deferred>
## Deferred Ideas

- Cross-browser testing (Firefox, Safari/WebKit) — explicitly out of scope for v1
- Playwright UI mode (`--ui`) convenience script — tagged as v2 nice-to-have (DX-01 in REQUIREMENTS.md)
- Docker Compose for full local stack — v2 (DX-02)

</deferred>

---

*Phase: 01-playwright-package-foundation*
*Context gathered: 2026-06-27 via discuss-phase*
