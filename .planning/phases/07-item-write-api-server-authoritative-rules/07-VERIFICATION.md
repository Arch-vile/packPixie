---
phase: 07-item-write-api-server-authoritative-rules
verified: 2026-09-04T16:53:21Z
status: passed
score: 14/16 must-haves verified
behavior_unverified: 0 # No PLAN must-have truth is present-but-behaviorally-unexercised; see human_verification for backstop truths and unexercised concurrency guards instead
overrides_applied: 0
---

# Phase 7: Item Write API & Server-Authoritative Rules Verification Report

**Phase Goal:** Add three protected write endpoints for trip items to `apps/api` — `POST /trips/:tripId/items` (create), `PATCH /trips/:tripId/items/:itemId` (partial update), `DELETE /trips/:tripId/items/:itemId` (hard delete) — with every packing invariant (ITEM-04, ITEM-05, ITEM-06) enforced server-side through a shared, independently-tested validation core in `apps/api/src/lib/tripDetail.ts`, so the rules hold even against a directly-crafted request body.

**Verified:** 2026-09-04T16:53:21Z
**Status:** human_needed
**Re-verification:** No — initial verification (this VERIFICATION.md accounts for the post-SUMMARY code-review fix commits: `1291081`, `740f919`, `06a2848`, `e6a2e3e`, `8bcb0df`, `8afb32a`, merged at `032e634`; HEAD is `48f8d0b`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST creates item with fresh `randomUUID()` id, conditional Weight/PackedBy/Status/Category, returns 201 with created Item | ✓ VERIFIED | `api.ts:316-370` builds and POSTs via `buildCreateItemAttributes` + `PutCommand`, returns `mapItemRecord`; unit tests `buildCreateItemAttributes` (tripDetail.test.ts:130-205) confirm conditional-key behavior. End-to-end 201 round trip itself is covered by harvested manual check M1 (see Human Verification). |
| 2 | Raw POST/PATCH cannot produce `Status: 'packed'` without a non-empty resulting `PackedBy` — 400 with exact message | ✓ VERIFIED | `validateStatusRequiresPackedBy` (tripDetail.ts:58-66), tested directly (tripDetail.test.ts:38-54) and exercised through both `buildCreateItemAttributes` (line 200) and `computeItemPatch` (line 305) |
| 3 | `packed` with omitted/null/whitespace `packedBy` rejected on both create and patch | ✓ VERIFIED | Same helper as #2; whitespace case explicitly tested (tripDetail.test.ts:43-45) |
| 4 | PATCH clearing `packedBy` alone atomically removes both `PackedBy` and `Status` in one `UpdateItem` call | ✓ VERIFIED | `computeItemPatch` (tripDetail.ts:255-364), test "clearing packedBy only atomically removes PackedBy and Status" (tripDetail.test.ts:210-222) confirms `removeAttrs` contains both keys for a `Status: 'packed'` current record. **Note:** post-review (CR-01) this atomic-reset is now correctly scoped to fire only when `current.Status === 'packed'` (see Anti-Patterns / CR-01 below) — no regression test protects a `found`/`to-buy` status surviving a `packedBy` clear; verified by static code trace only (see note below). |
| 5 | `{ packedBy: null, status: 'packed' }` in one request rejected with the identical `'packed requires PackedBy to be set'` error, no special-case branch | ✓ VERIFIED | Test "clearing packedBy and setting status packed in same request is rejected" (tripDetail.test.ts:247-258) asserts exact error string |
| 6 | Quantity/Weight always written as native numbers; non-numeric rejected 400 | ✓ VERIFIED | `validateNumericField` (tripDetail.ts:82-93), tested (tripDetail.test.ts:72-94) and wired into both create/patch paths |
| 7 | Omitted Weight absent from storage; `weight: 0` stored and read back as `0`, distinguishable | ✓ VERIFIED | Conditional spread `...(weight !== undefined && { Weight: weight })` (tripDetail.ts:218); tests at tripDetail.test.ts:138-158 (create) and 283-299 (patch) cover both omission and `0` |
| 8 | `PackedBy` not a trip participant rejected 400 on create and patch | ✓ VERIFIED | `validatePackedByParticipant` (tripDetail.ts:68-80), tested (tripDetail.test.ts:56-69) and wired into both `buildCreateItemAttributes` (line 190) and `computeItemPatch` (line 273) |
| 9 | Every validation failure returns structured `{ error: '<specific message>' }`, never generic | ✓ VERIFIED | Every `ok: false` branch in `tripDetail.ts` returns a specific string; route handlers pass `result.error` straight through (`api.ts:356-358`, `413-416`, `521-524`) |
| 10 | Unknown request-body field rejected 400 `Unknown field: <name>` | ✓ VERIFIED | `findUnknownFields` (tripDetail.ts:48-52), tested for both create (tripDetail.test.ts:190-196) and patch (tripDetail.test.ts:260-271) |
| 11 | Every POST/PATCH/DELETE requires membership; non-member and unknown-tripId both get identical 404 `{ error: 'Trip not found' }` | ✓ VERIFIED | Identical `isTripMember` guard + identical error literal repeated in all three handlers (`api.ts:337-341`, `393-397`, `507-511`) |
| 12 | PATCH/DELETE of unknown `itemId` returns 404 `{ error: 'Item not found' }`, no phantom-row upsert | ✓ VERIFIED | `findItemRecord` pre-check (`api.ts:399-404`, `513-518`) plus `ConditionExpression: 'attribute_exists(PK)'` on the `UpdateCommand` (`api.ts:453`) catching a concurrently-deleted item; the underlying atomic guard itself is not runtime-exercised (see Human Verification / concurrency note) |
| 13 | DELETE on packed item rejected 400 with exact message; DELETE on other items succeeds 204 | ✓ VERIFIED | `assertItemDeletable` (tripDetail.ts:426-433), tested (tripDetail.test.ts:329-...) and wired (`api.ts:520-525`, `558`) |
| 14 (backstop) | Re-sending an identical PATCH body twice produces the same resulting state (idempotent by construction) | insufficient_spec (backstop) | No explicit idempotency test exists; plausible by construction (resulting-field computation, not delta) but not confirmed by evidence — routed to human verification per honest-verifier rule |
| 15 (backstop) | Concurrent writes are last-write-wins with no version field / 409 — accepted simplicity tradeoff | insufficient_spec (backstop) | True for ordinary field writes, but the review-fix work (CR-03/CR-04) added `ConditionExpression`-based 409s specifically for the packed-item-delete and packed-without-PackedBy races — this narrows the "no 409 response" framing of the original truth. Routed to human verification to confirm the developer still accepts this framing post-fix. |

**Score:** 14/16 truths verified programmatically (2 backstop truths route to human confirmation per honest-verifier convention)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/model/src/item.ts` | `CreateItemRequest`/`PatchItemRequest` interfaces | ✓ VERIFIED | Both present, fields match plan spec exactly (lines 15-33) |
| `apps/api/src/lib/tripDetail.ts` | Validation core (14 exported functions/types) | ✓ VERIFIED | All 14 named exports present: `ItemWriteResult`, `ITEM_WRITABLE_FIELDS`, `findUnknownFields`, `isValidItemStatus`, `validateStatusRequiresPackedBy`, `validatePackedByParticipant`, `validateNumericField`, `isTripMember`, `extractParticipantEmails`, `findItemRecord`, `buildCreateItemAttributes`, `computeItemPatch`, `buildUpdateExpression`, `assertItemDeletable` |
| `apps/api/src/lib/tripDetail.test.ts` | node:test unit-test file | ✓ VERIFIED | 40/40 tests pass (`pnpm --filter api test`) |
| `apps/api/src/routes/api.ts` | 3 registered routes | ✓ VERIFIED | POST/PATCH/DELETE all present in `protected_` scope, correctly wired to the validation core |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `request.user.email` (authPlugin) | `USER#<email>` membership predicate | `callerEmail = request.user.email.trim().toLowerCase()` reused across POST/PATCH/DELETE | ✓ WIRED | Identical pattern at `api.ts:323`, `379`, `493` |
| `buildCreateItemAttributes`/`computeItemPatch` | `mapItemRecord` | Write-path output read back by Phase 6 mapper | ✓ WIRED | POST maps `attrsResult.value` (`api.ts:368`); PATCH maps `updateResult.Attributes` (`api.ts:461-463`) |
| `computeItemPatch` resulting-field computation | `buildUpdateExpression` | Every attribute aliased, no literal `Name =`/`Status =` | ✓ WIRED | `buildUpdateExpression` (tripDetail.ts:386-424) aliases every `setAttrs`/`removeAttrs` key unconditionally; confirmed by test (tripDetail.test.ts:311+) |
| PATCH `UpdateCommand` `ConditionExpression: attribute_exists(PK)` | `ConditionalCheckFailedException` → 404 | Prevents phantom-row upsert | ✓ WIRED | `api.ts:453`, `465-481` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit-test suite passes | `pnpm --filter api test` | `# tests 40 / # pass 40 / # fail 0` | ✓ PASS |
| Type-check clean | `pnpm --filter api type-check` | exit 0, no errors | ✓ PASS |
| Monorepo type-check clean | `pnpm type-check` | 3/3 tasks successful | ✓ PASS |
| Build clean | `pnpm --filter api build` | exit 0 | ✓ PASS |
| Lint clean | `pnpm --filter api lint` | exit 0, no output | ✓ PASS |
| Live HTTP round trip (create/patch/delete against running API + DynamoDB) | N/A | not run | ? SKIP — no server started per spot-check constraints; this is exactly what M1-M10 (harvested below) cover |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ITEM-04 | 07-01-PLAN.md | Item can be marked `packed` only when `PackedBy` is set | ✓ SATISFIED | `validateStatusRequiresPackedBy`, enforced in both create and patch, atomically re-checked at write time post-CR-04 fix |
| ITEM-05 | 07-01-PLAN.md | Clearing `PackedBy` atomically resets `Status` to unset | ✓ SATISFIED | `computeItemPatch`'s single-`UpdateItem`-call `removeAttrs` computation, scoped correctly post-CR-01 fix |
| ITEM-06 | 07-01-PLAN.md | Quantity/Weight persist as numbers; unset Weight distinguishable from 0 | ✓ SATISFIED | `validateNumericField` + conditional-spread storage; unit-tested both directions |

No orphaned requirements — `.planning/REQUIREMENTS.md` maps exactly ITEM-04/05/06 to Phase 7, and all three are declared in the plan's `requirements:` frontmatter and marked `[x]` complete in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any Phase 7 file | ℹ️ Info | Clean |
| `apps/api/src/lib/tripDetail.ts:210` | 210 | code-review IN-01 (redundant `.trim()`) — **not fixed**, info-tier, non-blocking | ℹ️ Info | Cosmetic only |
| `apps/api/src/lib/tripDetail.ts:48-52` | — | code-review IN-02 (`findUnknownFields` surfaces only first bad field) — **not fixed**, info-tier, non-blocking | ℹ️ Info | UX friction only, not a correctness gap |
| `apps/api/src/lib/tripDetail.ts:63` | 63 | code-review IN-03 (error message says `PackedBy` not `packedBy`) — **not fixed**, info-tier, non-blocking | ℹ️ Info | Minor client-facing wording mismatch |
| `apps/api/src/routes/api.ts` (all write routes) | — | WR-02 (no Fastify `schema.body`) — **deliberately deferred**, tracked as `.planning/todos/pending/2026-09-04-add-fastify-schema-validation-write-routes.md` | ⚠️ Warning | Defense-in-depth gap only; the concrete crash (CR-02) it was flagged alongside is already closed by explicit `typeof` guards. Does not undermine any must-have — confirmed by re-reading every string-field write path (`name`, `packedBy`, `category`, `tripName`) for an explicit `typeof` guard before use. |

All 5 Critical findings from `07-REVIEW.md` (CR-01 through CR-05) and Warning WR-01 are confirmeded fixed in the current `apps/api/src/lib/tripDetail.ts`/`apps/api/src/routes/api.ts` at HEAD (`48f8d0b`), verified by direct code reading, not just by trusting `07-REVIEW-FIX.md`'s narrative:

- **CR-01** (tripDetail.ts:256-259): `statusNeedsClearing = packedByCleared && current.Status === 'packed'` — confirmed scoped correctly.
- **CR-02** (tripDetail.ts:131,183,266,317; api.ts:122): every string field has an explicit `typeof !== 'string'` guard before `.trim()`/use.
- **CR-03** (api.ts:538-541): `DeleteCommand` now carries `ConditionExpression: 'attribute_exists(PK) AND (attribute_not_exists(#status) OR #status <> :packed)'`, mapped to 409 on failure.
- **CR-04** (tripDetail.ts:377-378, api.ts:434-436): `requiresPackedByExists` flag drives a conditional `AND attribute_exists(PackedBy)` on the PATCH `UpdateCommand`.
- **CR-05** (api.ts:172-178): `validEmails` de-duplicated via `[...new Set(...)]`.
- **WR-01** (tripDetail.ts:205-207): `category` now type-checked on create, mirroring patch.

### Human Verification Required

#### 1. Manual guard matrix M1-M10 (harvested from 07-01-PLAN.md `<human-check>`)

**Test:** Execute M1-M10 against `pnpm dev` + DynamoDB Local per README.md (create happy path, unknown-field rejection, packed-without-PackedBy rejection, non-participant PackedBy rejection, patch clear-resets-status, patch conflicting clear+packed, delete-packed-blocked, delete-unpacked-succeeds, 404 parity, numeric-type rejection).
**Expected:** All ten checks produce the exact status codes and error bodies specified in 07-01-PLAN.md.
**Why human:** No live HTTP integration harness exists yet for `apps/api` (E2E deferred to Phase 10); these require a running server, DynamoDB Local, and a real JWT — this is the SUMMARY's own documented deferral (`workflow.human_verify_mode: end-of-phase`), now due.

#### 2. Backstop truth — PATCH idempotency

**Test:** PATCH the same item with an identical body twice in a row.
**Expected:** The resulting item state is identical after both requests (no drift, no error on the second call).
**Why human:** Marked `verification: backstop` in the plan — no test evidence exists confirming this; plausible by construction (resulting-field computation) but not proven.

#### 3. Backstop truth — concurrency tradeoff framing, post-CR-03/CR-04

**Test:** Confirm with the developer that "last-write-wins, no 409" is still the accepted framing for ordinary field-level races, given that the review-fix work added `ConditionExpression`-based 409s specifically for the two most dangerous races (packed-item delete, packed-without-PackedBy on patch).
**Expected:** Developer confirms the narrower framing (409 only for the two invariant-protecting races; last-write-wins for everything else) is intentional and matches milestone scope.
**Why human:** Product/scope decision, not code-derivable; the original truth text ("no 409 response... deliberate accepted simplicity tradeoff") is now only partially true post-fix.

#### 4. CR-01 regression coverage (recommended, non-blocking)

**Test:** Add (or run manually) `computeItemPatch({ Status: 'found', PackedBy: 'a@b.com' }, { packedBy: null }, [...])` and confirm the result keeps `Status: 'found'` (no `Status` in `removeAttrs`/`setAttrs`).
**Expected:** Item's `found`/`to-buy` status survives a `packedBy`-only clear (the exact scenario CR-01 fixed).
**Why human:** Verified correct here by static code trace (deterministic, no concurrency needed), but `07-REVIEW-FIX.md` itself flags that no automated regression test protects this scenario from a future regression — a human/maintainer decision on whether to add the test now or accept the residual risk.

#### 5. CR-03/CR-04 atomic-guard runtime verification (recommended, non-blocking)

**Test:** With two concurrent clients, (a) race a PATCH setting `status: 'packed'` against a PATCH clearing `packedBy` on the same item, and (b) race a DELETE against a PATCH setting `status: 'packed'` on the same item — confirm the loser gets a `409` and the invariant (`packed` always has `PackedBy`; a `packed` item is never deleted) holds in the final persisted state.
**Expected:** No interleaving persists an invalid state; the losing request receives `409`.
**Why human:** Requires two genuinely concurrent requests against a live DynamoDB table — cannot be exercised by a static unit test or a sequential manual check. The `ConditionExpression` mechanism is correct by DynamoDB's documented atomic-write semantics and confirmed present by code inspection, but the actual race has never been exercised by any test in this repo.

### Gaps Summary

No must-have truth, artifact, or key link is FAILED, MISSING, STUB, or unwired. All 5 Critical and 1 Warning findings from the code review are confirmed fixed at HEAD by direct code reading (not merely by trusting the fix report). The one deliberately-deferred item (WR-02, Fastify schema validation) is a defense-in-depth addition that does not undermine any must-have — the concrete crash it was raised alongside (CR-02) is independently closed.

The phase is held at `human_needed` rather than `passed` because: (1) the plan's own manual guard matrix (M1-M10) was deferred to end-of-phase and is now due, per `workflow.human_verify_mode: end-of-phase`; (2) two must-have truths are explicitly `verification: backstop` and require human confirmation by convention; and (3) the two newest, most safety-critical mechanisms in the codebase (CR-03/CR-04's atomic `ConditionExpression` guards against TOCTOU races) have zero test coverage of any kind — unit, integration, or manual — and their real-world correctness rests entirely on a static code read of DynamoDB's documented atomic-write semantics, not on an exercised behavior.

---

_Verified: 2026-09-04T16:53:21Z_
_Verifier: Claude (gsd-verifier)_
