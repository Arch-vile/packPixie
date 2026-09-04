---
status: testing
phase: 07-item-write-api-server-authoritative-rules
source: [07-VERIFICATION.md]
started: 2026-09-04T16:55:00.000Z
updated: 2026-09-04T16:55:00.000Z
---

## Current Test

number: 1
name: Manual guard matrix M1-M10 (harvested from 07-01-PLAN.md `<human-check>`)
expected: |
  Execute M1-M10 against `pnpm dev` + DynamoDB Local per README.md (create happy path,
  unknown-field rejection, packed-without-PackedBy rejection, non-participant PackedBy
  rejection, patch clear-resets-status, patch conflicting clear+packed, delete-packed-blocked,
  delete-unpacked-succeeds, 404 parity, numeric-type rejection). All ten checks produce the
  exact status codes and error bodies specified in 07-01-PLAN.md.
awaiting: user response

## Tests

### 1. Manual guard matrix M1-M10 (harvested from 07-01-PLAN.md `<human-check>`)
expected: |
  Execute M1-M10 against `pnpm dev` + DynamoDB Local per README.md (create happy path,
  unknown-field rejection, packed-without-PackedBy rejection, non-participant PackedBy
  rejection, patch clear-resets-status, patch conflicting clear+packed, delete-packed-blocked,
  delete-unpacked-succeeds, 404 parity, numeric-type rejection). All ten checks produce the
  exact status codes and error bodies specified in 07-01-PLAN.md.
result: [pending]

### 2. Backstop truth — PATCH idempotency
expected: |
  PATCH the same item with an identical body twice in a row. The resulting item state is
  identical after both requests (no drift, no error on the second call).
result: [pending]

### 3. Backstop truth — concurrency tradeoff framing, post-CR-03/CR-04
expected: |
  Confirm with the developer that "last-write-wins, no 409" is still the accepted framing for
  ordinary field-level races, given that the review-fix work added `ConditionExpression`-based
  409s specifically for the two most dangerous races (packed-item delete, packed-without-PackedBy
  on patch). Developer confirms the narrower framing (409 only for the two invariant-protecting
  races; last-write-wins for everything else) is intentional and matches milestone scope.
result: [pending]

### 4. CR-01 regression coverage (recommended, non-blocking)
expected: |
  Add (or run manually) `computeItemPatch({ Status: 'found', PackedBy: 'a@b.com' }, { packedBy: null }, [...])`
  and confirm the result keeps `Status: 'found'` (no `Status` in `removeAttrs`/`setAttrs`) — the
  item's `found`/`to-buy` status survives a `packedBy`-only clear.
result: [pending]

### 5. CR-03/CR-04 atomic-guard runtime verification (recommended, non-blocking)
expected: |
  With two concurrent clients, (a) race a PATCH setting `status: 'packed'` against a PATCH
  clearing `packedBy` on the same item, and (b) race a DELETE against a PATCH setting
  `status: 'packed'` on the same item — confirm the loser gets a `409` and the invariant
  (`packed` always has `PackedBy`; a `packed` item is never deleted) holds in the final
  persisted state.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
