---
phase: 05-shared-item-model-comments-cleanup
plan: 01
subsystem: api
tags: [typescript, model, dto, monorepo, cleanup, dynamodb]

# Dependency graph
requires:
  - phase: 04 (prior trip work)
    provides: "@packpixie/model barrel (status.ts, trip.ts) and the camelCase shared-DTO convention this contract mirrors"
provides:
  - "@packpixie/model exports Item, ItemStatus, and TripDetailResponse (D-02/D-06 read contract)"
  - "Dead Comments scaffold fully removed across all three packages (D-09)"
affects: [06-read-api, 07-write-api, 08-table-ui, filters, e2e]

# Actuals (#2632)
actuals:
  tokens: 2397
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One-concept-per-file model modules re-exported through the index.ts barrel with .js ESM extensions"
    - "Absent optional field denotes unset — no null/'' sentinels, no 'unset' union member"

key-files:
  created:
    - packages/model/src/item.ts
  modified:
    - packages/model/src/index.ts
    - apps/api/src/routes/api.ts
    - apps/client/src/App.tsx
    - apps/client/src/api/api.ts
  deleted:
    - packages/model/src/comment.ts
    - apps/client/src/Comments.tsx

key-decisions:
  - "ItemStatus is a closed union 'to-buy' | 'found' | 'packed'; an unset status is an absent field (D-04)"
  - "Optional fields (weight, packedBy, status, category) use absence for unset — never null or '' (D-04)"
  - "No write DTOs (CreateItemRequest/UpdateItemRequest) in Phase 5 — deferred to Phase 7 (D-07)"
  - "No dead/token imports of the new types added to satisfy SC#2 — apps already depend on @packpixie/model, so type-check green is the satisfaction (scope note)"
  - "Orphaned COMMENTS DynamoDB partition accepted with no migration (D-09)"

patterns-established:
  - "New shared read DTOs live in @packpixie/model and mirror trip.ts verbatim (plain interfaces, ISO-string dates, string[] participants)"

requirements-completed: [MODEL-01, MODEL-02]

coverage:
  - id: D1
    description: "@packpixie/model exports Item, ItemStatus, and TripDetailResponse with the D-02/D-06 shape (UsedBy/Carried and DynamoDB keys excluded)"
    requirement: MODEL-01
    verification:
      - kind: automated
        ref: "pnpm type-check (monorepo tsc --noEmit, all 3 tasks green)"
        status: pass
      - kind: automated
        ref: "pnpm build produces packages/model/dist/item.d.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Comments scaffold fully removed — routes, component, client API fns, model types, barrel export — no dangling reference"
    requirement: MODEL-02
    verification:
      - kind: automated
        ref: "grep -rniI comment apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v /dist/ returns empty"
        status: pass
      - kind: automated
        ref: "pnpm build && pnpm type-check (monorepo green after removal)"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-08-12
status: complete
---

# Phase 5 Plan 01: Item Model + Comments Cleanup Summary

**Shared read contract (Item, ItemStatus, TripDetailResponse) landed in @packpixie/model and the dead Comments scaffold fully removed across all three packages — monorepo build, type-check, and grep gate all green.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-08-12T10:48:14Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 3 modified, 2 deleted)

## Accomplishments
- Created `packages/model/src/item.ts` implementing the D-02/D-06 contract verbatim: `ItemStatus` closed union, `Item` interface (required itemId/createdAt/name/quantity/consumable; optional weight/packedBy/status/category), and `TripDetailResponse` with `items: Item[]`.
- Wired the new module into the public API via `export * from './item.js'` in the barrel.
- Removed the entire Comments feature as one coherent change across all five source sites plus the barrel re-export (D-09).
- Verified green: `pnpm build`, `pnpm type-check`, and the comment grep gate (excluding node_modules and /dist/).

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Land the Item/TripDetailResponse type contract** - `9b8e1d9` (feat)
2. **Task 2: Remove the Comments scaffold across all three packages** - `bb86734` (feat)

## Files Created/Modified
- `packages/model/src/item.ts` (created) - ItemStatus/Item/TripDetailResponse read contract
- `packages/model/src/index.ts` (modified) - added item.js barrel export, removed comment.js export
- `apps/api/src/routes/api.ts` (modified) - deleted GET/POST /comments handlers and the now-unused PutCommand import
- `apps/client/src/App.tsx` (modified) - removed Comments import and render usage
- `apps/client/src/api/api.ts` (modified) - deleted getComments/postComment and pruned comment types from the model import
- `packages/model/src/comment.ts` (deleted) - TripComment/GetCommentsResponse
- `apps/client/src/Comments.tsx` (deleted) - Comments component

## Decisions Made
Followed plan as specified. All D-02/D-06 field names implemented verbatim; no write DTOs added (deferred to Phase 7 per D-07); no dead token imports added to satisfy SC#2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed the now-unused `PutCommand` SDK import from apps/api**
- **Found during:** Task 2 (Comments scaffold removal)
- **Issue:** The Task 2 `read_first` note flagged `QueryCommand`/`PutCommand` as possibly used by surviving trip routes ("do not remove blindly"). On inspection, `PutCommand` was used ONLY inside the deleted POST /comments handler (trip writes use `TransactWriteCommand`/`BatchWriteCommand`). Leaving it would be an unused import — a `noUnusedLocals` type-check failure and a CLAUDE.md "leave nothing unused behind" violation.
- **Fix:** Dropped `PutCommand` from the `@aws-sdk/lib-dynamodb` import block; kept `QueryCommand` (still used by trip routes), `TransactWriteCommand`, and `BatchWriteCommand`.
- **Files modified:** apps/api/src/routes/api.ts
- **Verification:** `pnpm type-check` green; grep gate empty.
- **Committed in:** bb86734 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking / leave-nothing-unused). This is exactly the removal the plan required — `PutCommand` became obsolete with the comments handler.
**Impact on plan:** No scope creep. Necessary to keep the build green and honor CLAUDE.md.

## Issues Encountered
- The fresh worktree had no `node_modules`, so `pnpm build` initially failed with `turbo: command not found`. Resolved by running `pnpm install --frozen-lockfile` to hydrate the existing dependency tree from the committed lockfile (no new packages added). This is environment setup, not a plan step.

## User Setup Required
None - no external service configuration required. Orphaned `COMMENTS` DynamoDB records are accepted per D-09 with no migration.

## Next Phase Readiness
- The shared read contract is published and both apps type-check against it — Phase 6 (read API) and Phase 8 (table UI) can now import `Item`/`TripDetailResponse` as real consumers.
- No blockers.

## Self-Check: PASSED

- `packages/model/src/item.ts` exists (FOUND)
- `packages/model/src/comment.ts` deleted (confirmed gone)
- `apps/client/src/Comments.tsx` deleted (confirmed gone)
- Commit `9b8e1d9` (Task 1) present in git log
- Commit `bb86734` (Task 2) present in git log

---
*Phase: 05-shared-item-model-comments-cleanup*
*Completed: 2026-08-12*
