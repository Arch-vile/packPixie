---
phase: 07-item-write-api-server-authoritative-rules
plan: 01
subsystem: api
tags: [fastify, dynamodb, typescript, node:test, tdd]

requires:
  - phase: 06-trip-detail-read-api-participation-guard
    provides: mapItemRecord storage-attribute contract (D-04), participation-guard query pattern
provides:
  - "POST /trips/:tripId/items — create with server-authoritative validation"
  - "PATCH /trips/:tripId/items/:itemId — partial update with atomic packed/PackedBy invariant enforcement"
  - "DELETE /trips/:tripId/items/:itemId — hard delete, blocked on packed items"
  - "apps/api/src/lib/tripDetail.ts validation core (findUnknownFields, isValidItemStatus, validateStatusRequiresPackedBy, validatePackedByParticipant, validateNumericField, isTripMember, extractParticipantEmails, findItemRecord, buildCreateItemAttributes, computeItemPatch, buildUpdateExpression, assertItemDeletable)"
  - "apps/api/src/lib/tripDetail.test.ts — first unit-test file in the repo, run via node:test through tsx"
affects: [08-trip-detail-ui-inline-edit]

actuals:
  tokens: 7700
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "node:test + tsx --test for unit tests (no new test framework dependency)"
    - "ItemWriteResult<T> discriminated-union result type for validation functions"
    - "Resulting-field computation before invariant check (compute the full resulting state, then validate it, rather than branching on which fields changed) — makes packedBy-clear + status-set-in-same-request compose for free"
    - "Every DynamoDB UpdateExpression attribute name/value aliased (#s0/:v0, #r0), never a literal reserved word"

key-files:
  created:
    - apps/api/src/lib/tripDetail.test.ts
  modified:
    - packages/model/src/item.ts
    - apps/api/src/lib/tripDetail.ts
    - apps/api/src/routes/api.ts
    - apps/api/package.json

key-decisions:
  - "computeItemPatch takes body as Record<string, unknown> per plan spec; the PATCH route casts request.body (typed PatchItemRequest) to Record<string, unknown> at the call site since a plain TS interface has no index signature and isn't structurally assignable to Record<string, unknown> as a function argument"
  - "Every UpdateExpression attribute name is aliased (not just reserved words Name/Status) — simplest and safest per the plan's explicit guidance"

patterns-established:
  - "Shared validation core in apps/api/src/lib/tripDetail.ts, unit-tested independently of the HTTP layer via node:test"
  - "404 parity: identical { error: 'Trip not found' } for non-member and unknown tripId; identical { error: 'Item not found' } for unknown itemId and PATCH-of-concurrently-deleted item (via ConditionExpression: attribute_exists(PK))"

requirements-completed: [ITEM-04, ITEM-05, ITEM-06]

coverage:
  - id: D1
    description: "POST /trips/:tripId/items creates an item with server-validated fields, rejecting packed-without-PackedBy, non-participant PackedBy, unknown fields, and non-numeric quantity/weight with specific 400 messages"
    requirement: ITEM-04
    verification:
      - kind: unit
        ref: "apps/api/src/lib/tripDetail.test.ts#buildCreateItemAttributes"
        status: pass
      - kind: manual_procedural
        ref: "M1-M4, M10 in 07-01-PLAN.md <human-check>"
        status: unknown
    human_judgment: true
    rationale: "No live HTTP integration harness exists yet for apps/api (E2E deferred to Phase 10); the manual guard matrix M1-M10 requires pnpm dev + DynamoDB Local + a real JWT and is deferred to end-of-phase per workflow.human_verify_mode=end-of-phase"
  - id: D2
    description: "PATCH atomically enforces packed-requires-PackedBy and the PackedBy-clear/Status-reset invariant in a single UpdateItem call, including the same-request conflict case"
    requirement: ITEM-05
    verification:
      - kind: unit
        ref: "apps/api/src/lib/tripDetail.test.ts#computeItemPatch"
        status: pass
      - kind: manual_procedural
        ref: "M5, M6, M9 in 07-01-PLAN.md <human-check>"
        status: unknown
    human_judgment: true
    rationale: "Same manual-guard-matrix deferral as D1 — requires a running API + DynamoDB Local"
  - id: D3
    description: "Quantity/Weight always persist as native DynamoDB numbers; unset Weight is absent, weight:0 is distinguishable"
    requirement: ITEM-06
    verification:
      - kind: unit
        ref: "apps/api/src/lib/tripDetail.test.ts#buildCreateItemAttributes, #computeItemPatch"
        status: pass
    human_judgment: false
  - id: D4
    description: "DELETE hard-deletes non-packed items (204) and rejects deletion of packed items (400) with no phantom-row upserts on PATCH/DELETE of unknown itemId"
    verification:
      - kind: unit
        ref: "apps/api/src/lib/tripDetail.test.ts#assertItemDeletable"
        status: pass
      - kind: manual_procedural
        ref: "M7, M8, M9 in 07-01-PLAN.md <human-check>"
        status: unknown
    human_judgment: true
    rationale: "Same manual-guard-matrix deferral as D1/D2"

duration: 7min (commit span; excludes reasoning/reading time)
completed: 2026-09-04
status: complete
---

# Phase 7 Plan 1: Item Write API & Server-Authoritative Rules Summary

**Three protected item-write endpoints (POST/PATCH/DELETE on `/trips/:tripId/items[/:itemId]`) enforcing packed-requires-PackedBy, atomic PackedBy-clear/Status-reset, and numeric-typing invariants server-side through an independently unit-tested validation core.**

## Performance

- **Duration:** ~7 min commit-to-commit (6 commits, first at 18:01:50, last at 18:08:06 UTC+3)
- **Tasks:** 3 (all `tdd="true"`; Task 1 was `type="tracer"`)
- **Files modified:** 4 (1 new test file, 3 modified source files)

## Accomplishments

- `POST /trips/:tripId/items` — creates an item with a fresh `crypto.randomUUID()` id, writing `Name`/`Qty`/`Consumable` always and `Weight`/`PackedBy`/`Status`/`Category` only when supplied (conditional spread, never object spread), returning 201 with the mapped `Item`.
- `PATCH /trips/:tripId/items/:itemId` — computes the full resulting field set (not a delta) before validating it, so `status: 'packed'` is rejected whenever the resulting `PackedBy` would be unset — this naturally rejects `{ packedBy: null, status: 'packed' }` in one request with no special-case branch. Clearing `packedBy` alone (no `status` key at all) atomically removes both `PackedBy` and `Status` in the same `UpdateItem` call.
- `DELETE /trips/:tripId/items/:itemId` — hard delete, rejects packed items with 400 before issuing any `DeleteCommand`.
- Every mutation requires trip participation (`isTripMember`) and returns the identical `404 { error: 'Trip not found' }` for a non-member or unknown `tripId`; unknown `itemId` on PATCH/DELETE returns `404 { error: 'Item not found' }`, and PATCH additionally guards against a phantom-row upsert on a concurrently-deleted item via `ConditionExpression: 'attribute_exists(PK)'`.
- 40 unit tests added in `apps/api/src/lib/tripDetail.test.ts`, the first test file in the repo, run via `tsx --test` (Node's built-in `node:test` runner — no new dependency).

## Task Commits

Each task followed RED → GREEN (TDD):

1. **Task 1: Shared item-write validation core + POST /trips/:tripId/items** (tracer)
   - `b7a460e` test: add failing tests for item-write validation core
   - `75c43b9` feat: implement item-write validation core and POST /trips/:tripId/items
2. **Task 2: PATCH /trips/:tripId/items/:itemId — atomic invariant enforcement**
   - `2828fca` test: add failing tests for computeItemPatch and buildUpdateExpression
   - `5d7b487` feat: implement PATCH /trips/:tripId/items/:itemId with atomic invariant enforcement
3. **Task 3: DELETE /trips/:tripId/items/:itemId — block-on-packed guard**
   - `546c2c2` test: add failing tests for assertItemDeletable
   - `0ff87a9` feat: implement DELETE /trips/:tripId/items/:itemId with block-on-packed guard

_All 6 commits are `test`→`feat` RED/GREEN pairs, one pair per task._

## Files Created/Modified

- `apps/api/src/lib/tripDetail.test.ts` (new) — 40 `node:test` cases covering every exported validation function.
- `apps/api/src/lib/tripDetail.ts` — added `ItemWriteResult<T>`, `ITEM_WRITABLE_FIELDS`, `findUnknownFields`, `isValidItemStatus`, `validateStatusRequiresPackedBy`, `validatePackedByParticipant`, `validateNumericField`, `isTripMember`, `extractParticipantEmails`, `findItemRecord`, `buildCreateItemAttributes`, `ItemPatchResult`, `computeItemPatch`, `buildUpdateExpression`, `assertItemDeletable` (alongside the existing Phase 6 `mapItemRecord`).
- `apps/api/src/routes/api.ts` — registered `POST`/`PATCH`/`DELETE` on `/trips/:tripId/items[/:itemId]` in the `protected_` scope.
- `packages/model/src/item.ts` — added `CreateItemRequest` and `PatchItemRequest` (nullable fields on the latter signal "clear this attribute").
- `apps/api/package.json` — `"test"` script now runs `tsx --test src/lib/*.test.ts` (was `exit 1` placeholder).

## Decisions Made

- **TypeScript structural-typing gap:** `computeItemPatch`'s `body` parameter is typed `Record<string, unknown>` exactly as the plan specifies, but `request.body` in the PATCH handler is typed `PatchItemRequest` (a plain interface, no index signature). TypeScript does not allow passing an interface-typed value as an argument to a `Record<string, unknown>` parameter without an explicit cast. Fixed with `request.body as unknown as Record<string, unknown>` at the call site — the safest, most localized fix, since `computeItemPatch`'s own field-by-field validation (`findUnknownFields`, numeric/string/boolean checks) provides the actual runtime type safety regardless of the compile-time parameter type.
- Aliased every `UpdateExpression` attribute name (not only the reserved words `Name`/`Status`) per the plan's explicit "simplest and safest" guidance.

## Deviations from Plan

None — plan executed exactly as written, with one minor TypeScript compatibility fix (documented above under Decisions Made, not a Rule 1-3 deviation since it didn't change any behavior specified by the plan).

## Issues Encountered

- Fresh worktree had no `node_modules` and no built `packages/model/dist/` output. Ran `pnpm install` (existing lockfile, no new packages — not a Rule 3 package-legitimacy case) and `pnpm --filter @packpixie/model build` before the first type-check would resolve `@packpixie/model` imports. Both are standard workspace bootstrap steps, not deviations from the plan.
- `pnpm test` at the monorepo root fails with `Missing tasks in project — Could not find task 'test' in project` because `turbo.json` has no `"test"` pipeline task defined (pre-existing gap — `apps/client` and `apps/e2e` have never had a `test` script either). This predates this plan and is out of scope for `07-01`'s `files_modified` list; every task's own `<verify>` step (`pnpm --filter api test`) passes. Flagging here rather than fixing turbo.json, since adding a monorepo-wide test pipeline task is a build-tooling change outside this plan's stated scope.

## User Setup Required

None — no external service configuration required.

## Manual Verification Deferred

Per `workflow.human_verify_mode: end-of-phase` in `.planning/config.json`, the M1-M10 guard matrix in `07-01-PLAN.md`'s `<human-check>` block (create/patch/delete happy-path and error-path checks against a running `pnpm dev` + DynamoDB Local) is deferred to the end-of-phase verification step, not run during this plan's execution. All automated checks it depends on (`pnpm --filter api test`, `pnpm --filter api type-check`, `pnpm --filter api build`, `pnpm --filter api lint`, and monorepo-wide `pnpm lint`/`pnpm type-check`/`pnpm build`) are green.

## Next Phase Readiness

- Phase 8 (trip-detail UI, inline-edit) can build directly against the three new endpoints — request/response shapes (`CreateItemRequest`, `PatchItemRequest`, `Item`) are locked in `@packpixie/model`.
- The delete-blocks-on-packed 400 response (`'Cannot delete a packed item — unpack it first'`) is a UI decision point Phase 8 should handle (e.g. disabling delete on packed rows).
- No blockers. The pre-existing `Missing tasks in project` gap for root `pnpm test` (noted above) should be addressed whenever `apps/client`/`apps/e2e` gain test scripts, or via a dedicated tooling task — not blocking for Phase 8.

## Self-Check: PASSED

All 6 claimed files found on disk; all 6 claimed commit hashes (`b7a460e`, `75c43b9`, `2828fca`, `5d7b487`, `546c2c2`, `0ff87a9`) verified present in git history.

---
*Phase: 07-item-write-api-server-authoritative-rules*
*Completed: 2026-09-04*
