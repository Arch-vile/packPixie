---
status: passed
phase: 07-item-write-api-server-authoritative-rules
source: [07-VERIFICATION.md]
started: 2026-09-04T16:55:00.000Z
updated: 2026-09-05T12:20:00.000Z
---

## Tests

### 1. Manual guard matrix M1-M10 (harvested from 07-01-PLAN.md `<human-check>`)
expected: |
  Execute M1-M10 against `pnpm dev` + DynamoDB Local per README.md (create happy path,
  unknown-field rejection, packed-without-PackedBy rejection, non-participant PackedBy
  rejection, patch clear-resets-status, patch conflicting clear+packed, delete-packed-blocked,
  delete-unpacked-succeeds, 404 parity, numeric-type rejection). All ten checks produce the
  exact status codes and error bodies specified in 07-01-PLAN.md.
result: pass — all 10 checks (M1-M10) executed via curl against `pnpm --filter api dev`
  (AUTH_DEV_BYPASS=true) + DynamoDB Local, exact status codes and error bodies matched
  07-01-PLAN.md in every case.

### 2. Backstop truth — PATCH idempotency
expected: |
  PATCH the same item with an identical body twice in a row. The resulting item state is
  identical after both requests (no drift, no error on the second call).
result: pass — identical PATCH body sent twice against the same item; both calls returned
  200 with byte-identical resulting item state.

### 3. Backstop truth — concurrency tradeoff framing, post-CR-03/CR-04
expected: |
  Confirm with the developer that "last-write-wins, no 409" is still the accepted framing for
  ordinary field-level races, given that the review-fix work added `ConditionExpression`-based
  409s specifically for the two most dangerous races (packed-item delete, packed-without-PackedBy
  on patch). Developer confirms the narrower framing (409 only for the two invariant-protecting
  races; last-write-wins for everything else) is intentional and matches milestone scope.
result: pass — developer confirmed the narrower framing (409 only for the invariant-protecting
  races; last-write-wins for ordinary field races) is intentional and matches milestone scope.

### 4. CR-01 regression coverage (recommended, non-blocking)
expected: |
  Add (or run manually) `computeItemPatch({ Status: 'found', PackedBy: 'a@b.com' }, { packedBy: null }, [...])`
  and confirm the result keeps `Status: 'found'` (no `Status` in `removeAttrs`/`setAttrs`) — the
  item's `found`/`to-buy` status survives a `packedBy`-only clear.
result: pass — verified directly via `computeItemPatch`; `Status` absent from both
  `removeAttrs` and `setAttrs`, confirming it survives a `packedBy`-only clear.

### 5. CR-03/CR-04 atomic-guard runtime verification (recommended, non-blocking)
expected: |
  With two concurrent clients, (a) race a PATCH setting `status: 'packed'` against a PATCH
  clearing `packedBy` on the same item, and (b) race a DELETE against a PATCH setting
  `status: 'packed'` on the same item — confirm the loser gets a `409` and the invariant
  (`packed` always has `PackedBy`; a `packed` item is never deleted) holds in the final
  persisted state.
result: issue found and fixed — (b) DELETE-vs-PATCH-packed held correctly across 5/5 live
  race trials (CR-03 sound). (a) PATCH-status-packed vs PATCH-packedBy-clear reproducibly
  violated the invariant in 2/5 trials: both requests returned 200 and the item persisted
  as `status: 'packed'` with no `packedBy`. Root cause: CR-04's `requiresPackedByExists`
  guard only covered the status-setting write; the packedBy-clearing write decided whether
  to cascade-clear `Status` from a stale pre-write read, with no write-time re-check.
  Fixed in `apps/api/src/lib/tripDetail.ts` / `apps/api/src/routes/api.ts` (commit
  `7729448`): `computeItemPatch` now also returns `requiresStatusNotPacked`, and the PATCH
  route adds a symmetric `ConditionExpression` (mirroring the existing CR-03 delete guard).
  Re-verified against the same live race harness: 0/10 violations post-fix, with a `409`
  correctly returned on the losing side in 10/10 trials. 6 new unit tests added to
  `tripDetail.test.ts` covering `requiresStatusNotPacked` computation.

## Summary

total: 5
passed: 5
issues: 0 (1 found and fixed during this UAT pass — see test 5)
pending: 0
skipped: 0
blocked: 0

## Gaps

None outstanding. The one issue surfaced during UAT (CR-04 counterpart TOCTOU race, test 5)
was fixed and re-verified live in the same session (commit `7729448`).
