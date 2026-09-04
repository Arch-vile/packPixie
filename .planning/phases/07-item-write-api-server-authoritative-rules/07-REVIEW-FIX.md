---
phase: 07-item-write-api-server-authoritative-rules
fixed_at: 2026-09-04T15:34:04Z
review_path: .planning/phases/07-item-write-api-server-authoritative-rules/07-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 6
skipped: 1
status: partial
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-09-04T15:34:04Z
**Source review:** .planning/phases/07-item-write-api-server-authoritative-rules/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (5 critical + 2 warning; info-tier excluded from `critical_warning` fix scope)
- Fixed: 6
- Skipped: 1

Note: the `gsd-code-fixer` agent applied and committed all 6 fixes below atomically in an
isolated worktree (`gsd-reviewfix/07-62811`), then stalled (stream watchdog, no progress
for 600s) before writing this report. The orchestrator recovered the work: verified the
worktree was clean with all 6 fix commits present, merged it into `feat/packing-table-mvp`
(`032e634`), removed the worktree/branch, re-ran `pnpm --filter api test` (40/40 pass) and
`pnpm --filter api type-check` (clean) to confirm no regression, and is writing this report
by hand from the commit history and diffs.

## Fixed Issues

### CR-01: Clearing `packedBy` silently deletes a valid, unrelated `status`

**Files modified:** `apps/api/src/lib/tripDetail.ts`
**Commit:** `1291081`
**Applied fix:** `computeItemPatch` now only force-clears `Status` when the current status was
actually `'packed'` (`statusNeedsClearing = packedByCleared && current.Status === 'packed'`),
instead of unconditionally clearing it whenever `packedBy` is cleared. A `found`/`to-buy`
item's status now survives a `PATCH { packedBy: null }` request. Status: fixed (logic
change — verified against the review's reproduction steps and the existing 40-test suite,
which still passes; no new regression test was added for this exact scenario, see Skipped
note below is N/A — recommend adding one, tracked as a follow-up, not blocking).

### CR-02: Unvalidated field types crash the handler with an unhandled `TypeError`

**Files modified:** `apps/api/src/lib/tripDetail.ts`, `apps/api/src/routes/api.ts`
**Commit:** `740f919`
**Applied fix:** Added explicit `typeof !== 'string'` guards (returning a 400 `ok: false`
result) before every `.trim()` call on `name` and `packedBy` in both
`buildCreateItemAttributes` and `computeItemPatch`, and on `tripName` in the `POST /trips`
route handler. Malformed JSON (`null`, a number, etc.) for these fields now produces a clean
400 instead of an unhandled 500.

### CR-03: `DELETE` has no atomic guard — a concurrent status change to `packed` bypasses the invariant

**Files modified:** `apps/api/src/routes/api.ts`
**Commit:** `06a2848`
**Applied fix:** The `DeleteCommand` now carries
`ConditionExpression: 'attribute_exists(PK) AND (attribute_not_exists(#status) OR #status <> :packed)'`.
A `ConditionalCheckFailedException` is caught and returns `409 { error: 'Item was modified or
is packed — refresh and retry' }`, closing the TOCTOU window between the pre-check `Query`
and the `Delete`.

### CR-04: `packed` requires `packedBy` enforced against a stale read, not atomically

**Files modified:** `apps/api/src/lib/tripDetail.ts`, `apps/api/src/routes/api.ts`
**Commit:** `e6a2e3e`
**Applied fix:** `computeItemPatch` now returns a `requiresPackedByExists` flag, true when the
write sets `Status: 'packed'` without the same request also supplying `packedBy`. The PATCH
route conditionally appends `AND attribute_exists(PackedBy)` to the `UpdateCommand`'s
`ConditionExpression` in that case, and returns `409 { error: 'Item was modified
concurrently — refresh and retry' }` on a conditional-check failure (rather than the generic
404), so the interleaving traced in the review can no longer persist `Status: packed` with no
`PackedBy`.

### CR-05: Duplicate `participantEmails` crash `POST /trips` via `BatchWriteCommand`

**Files modified:** `apps/api/src/routes/api.ts`
**Commit:** `8bcb0df`
**Applied fix:** `validEmails` is now de-duplicated via `[...new Set(...)]` after
normalization (trim + lowercase), before being chunked into `BatchWriteCommand`s.

### WR-01: `category` is not type-validated on the create path

**Files modified:** `apps/api/src/lib/tripDetail.ts`
**Commit:** `8afb32a`
**Applied fix:** `buildCreateItemAttributes` now rejects a non-string `category` with
`{ ok: false, error: 'category must be a string' }`, mirroring the existing check already
present in `computeItemPatch`.

## Skipped Issues

### WR-02: No request-body schema validation registered on any route

**File:** `apps/api/src/routes/api.ts` (all `protected_.post`/`protected_.patch` registrations)
**Reason:** Not attempted before the fixer agent stalled. This is a broader defense-in-depth
addition (a Fastify `schema.body` per route) spanning every write route, not a targeted bug
fix — and the concrete runtime crash it was flagged alongside (malformed JSON reaching
`.trim()`) is already closed by CR-02's explicit `typeof` guards. Recommend tracking as a
follow-up hardening item rather than re-running the fixer for it.
**Original issue:** None of the routes pass a Fastify `schema` option, so all runtime
validation depends on hand-written checks in `tripDetail.ts` and inline route code.

---

_Fixed: 2026-09-04T15:34:04Z_
_Fixer: Claude (gsd-code-fixer, recovered by orchestrator after stall)_
_Iteration: 1_
