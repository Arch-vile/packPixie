---
phase: 08-trip-detail-inline-edit-table-ui
plan: 02
subsystem: ui
tags: [react, optimistic-ui, fastify-client, inline-edit]

# Dependency graph
requires:
  - phase: 08-01-client-side-routing-trip-detail-read
    provides: "react-router-dom wiring, TripDetail.tsx fetch-on-mount scaffolding, getTripDetail(tripId) API client function"
  - phase: 07-item-write-api-server-authoritative-rules
    provides: "POST/PATCH/DELETE /trips/:tripId/items[/:itemId] write endpoints, 409 conflict contract, packed-item delete rejection"
provides:
  - "createItem/patchItem/deleteItem API client functions and ConflictError class in api.ts"
  - "ItemTable component: always-editable Name/Quantity/Weight/PackedBy/Status/Category/Consumable cells with per-field auto-save"
  - "Optimistic updates with per-field reconciliation, rollback-on-failure, and a dedicated 409-conflict recovery UX"
  - "'+ Add item' immediate-POST row creation with re-entrancy guard"
  - "Delete-with-confirmation, packed-row guard, and 404-idempotent delete handling"
affects: [09-packing-view-filters]

# Actuals (#2632)
actuals:
  tokens: 5093
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "itemsRef mirrors the items prop via useEffect so async PATCH-response handlers never merge off a stale render's closure (RESEARCH.md Pitfall 2 mitigation)"
    - "Per-row local 'draft' state (useState + useEffect resync from prop) decouples in-progress typing from the committed server value for text/number fields; selects/checkboxes save immediately with no draft state needed"
    - "Field-scoped PATCH reconciliation: only the single changed field is merged back into local state from the server response, never the whole row"
    - "ConflictError (409) gets a dedicated row-level banner + manual Refresh button (re-fetches trip detail) — never a blind auto-retry"

key-files:
  created:
    - apps/client/src/ItemTable.tsx
  modified:
    - apps/client/src/api/api.ts
    - apps/client/src/TripDetail.tsx
    - apps/client/src/App.css

key-decisions:
  - "deleteItem (api.ts) absorbs a 404 response into a normal resolve rather than throwing, so ItemTable's single try/success path handles both a genuine delete and an already-gone item identically — no separate 404 branch needed in the component itself, satisfying ITEM-03's idempotency requirement with less code"
  - "Delete-button styling (.btn-destructive) was deferred from Task 2's App.css edit into Task 3's commit, matching the plan's task boundary exactly (Task 2 covers table/cell styling only) even though it would have been just as easy to add both at once"

requirements-completed: [ITEM-01, ITEM-02, ITEM-03]

coverage:
  - id: D1
    description: "A participant can click '+ Add item' and a new row appears immediately with PackedBy defaulted to the current user's email and Status unset, both server-issued via the POST response"
    requirement: "ITEM-01"
    verification: []
    human_judgment: true
    rationale: "No client test framework exists in apps/client (08-RESEARCH.md Validation Architecture) — this is ITEM-01's manual UAT per the plan's own human-check block."
  - id: D2
    description: "A participant can inline-edit any field (Name, Quantity, Weight, PackedBy, Status, Category, Consumable) on any row and the change persists via PATCH, surviving a page reload; a 409 conflict rolls back and offers Refresh; clearing Weight sends null distinct from typed 0; a blank Name blocks auto-save with a red-outline flag"
    requirement: "ITEM-02"
    verification: []
    human_judgment: true
    rationale: "No client test framework exists — this is ITEM-02's manual UAT (persistence-across-reload and the 409 path both require a real browser session against the live API)."
  - id: D3
    description: "A participant can delete a non-packed row only after confirming a native confirm() dialog, permanently removing it with no undo; delete is disabled with a tooltip on packed rows; a delete against an already-removed item is a silent no-op"
    requirement: "ITEM-03"
    verification: []
    human_judgment: true
    rationale: "No client test framework exists — this is ITEM-03's manual UAT (native dialog interaction and packed-row disabled-state hover tooltip both require visual/interactive confirmation)."

# Metrics
duration: ~20min
completed: 2026-09-06
status: complete
---

# Phase 8 Plan 2: Inline-Edit Item Table Summary

**Full inline-edit packing table wired against Phase 7's write API: always-editable cells with per-field optimistic auto-save, immediate-POST add-row, 409-conflict recovery via Refresh, and confirm-gated delete with a packed-row guard.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-06T12:09Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Added `createItem`, `patchItem`, `deleteItem`, and `ConflictError` to `api/api.ts`, following the existing POST-shape pattern; `patchItem` special-cases HTTP 409 into `ConflictError` before the generic failure branch, carrying the server's verbatim conflict message
- Built `ItemTable.tsx`: every cell (Name, Quantity, Weight, PackedBy, Status, Category, Consumable) is always-editable, saving on blur (text/number) or immediately on change (selects/checkbox), via one shared `handleFieldChange` handler
- Implemented optimistic updates that reconcile only the changed field from each `PATCH` response — never the whole row — and roll back to the last known-good server value on any failure, with a dedicated 409 branch (verbatim server message + manual "Refresh" button) distinct from the generic "Failed to save changes." copy
- "+ Add item" fires an immediate `POST` (re-entrancy guarded while in flight) and appends the server-issued row; a trimmed-empty Name blocks its own auto-save with a red-outline (`cell-invalid`) flag until filled (D-07)
- Wired `ItemTable` into `TripDetail.tsx` in place of Plan 08-01's read-only list; extracted the trip-detail fetch into `fetchTrip` so `onRefresh` reuses the same implementation
- Added delete: native `confirm()` gate, packed-row guard (`disabled` + `title="Unpack item before deleting"`), and idempotent 404-as-success handling so an already-deleted item silently disappears rather than surfacing a spurious error

## Task Commits

Each task was committed atomically:

1. **Task 1: API client: createItem, patchItem (409-aware), deleteItem, ConflictError** - `ce8bbe4` (feat)
2. **Task 2: ItemTable: inline-edit table, add-row, optimistic auto-save** - `82cbca4` (feat)
3. **Task 3: Delete confirmation, packed-row guard, and delete idempotency** - `773b529` (feat)

**Plan metadata:** (this SUMMARY's commit, made separately per worktree protocol)

## Files Created/Modified
- `apps/client/src/ItemTable.tsx` - NEW: the inline-edit item table (`ItemTable` + internal `ItemRow`), all mutation logic (add/edit/delete)
- `apps/client/src/api/api.ts` - new `createItem`, `patchItem`, `deleteItem` functions and `ConflictError` class
- `apps/client/src/TripDetail.tsx` - renders `<ItemTable>` in place of the read-only `<ul>`; `fetchTrip` extracted for reuse by `onRefresh`
- `apps/client/src/App.css` - `.item-table`, `.item-row`, per-cell classes, `.cell-invalid`, `.item-row-error`, `.item-table-actions`, `.btn-destructive`

## Decisions Made
- `deleteItem` in `api.ts` treats a 404 response as a normal resolve (not a thrown error), so `ItemTable`'s delete handler needs only one success path to cover both "genuinely deleted" and "already gone" — satisfies ITEM-03's idempotency requirement without a separate branch in the component.
- Kept `.btn-destructive` CSS addition scoped to Task 3's commit (not added early in Task 2) to keep each task's diff matching its own stated file/behavior scope exactly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The worktree's `node_modules` needed a `pnpm install` at the start of this plan (same environmental gap Plan 08-01 hit and documented) — no tracked files changed by this, `node_modules` is gitignored.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ITEM-01, ITEM-02, and ITEM-03 are implemented end-to-end against Phase 7's write API; `pnpm --filter client type-check`, `pnpm --filter client lint`, and root `pnpm build` all pass with zero errors.
- Manual UAT (per-task `<human-check>` blocks) has not yet been run interactively in this dispatch — recommend exercising it via `/gsd-verify-work` for Phase 8's overall sign-off, consistent with how Phases 6/7 were verified.
- Phase 9 (packing-view filters: `PackedBy = me` default, Status filter, show-all toggle) can build directly on this `ItemTable`/`TripDetail` foundation — no blockers.

## Self-Check: PASSED

- FOUND: apps/client/src/ItemTable.tsx
- FOUND: apps/client/src/api/api.ts (createItem/patchItem/deleteItem/ConflictError)
- FOUND: ce8bbe4 (Task 1 commit)
- FOUND: 82cbca4 (Task 2 commit)
- FOUND: 773b529 (Task 3 commit)

---
*Phase: 08-trip-detail-inline-edit-table-ui*
*Completed: 2026-09-06*
