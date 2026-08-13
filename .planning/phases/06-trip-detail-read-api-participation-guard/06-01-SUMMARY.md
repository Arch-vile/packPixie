---
phase: 06-trip-detail-read-api-participation-guard
plan: 01
subsystem: api
tags: [fastify, dynamodb, authorization, idor, enumeration-resistance, dto, esm]

# Dependency graph
requires:
  - phase: 05-shared-item-model-comments-cleanup
    provides: "@packpixie/model Item / ItemStatus / TripDetailResponse read contract"
provides:
  - "Protected GET /trips/:tripId read endpoint (single-query trip detail load)"
  - "Email-keyed participation guard with byte-identical 404 (enumeration-resistant, IDOR-safe)"
  - "apps/api/src/lib/tripDetail.ts::mapItemRecord — the storage->DTO attribute contract Phase 7's writer must match (D-04)"
affects: [07-item-table-write-path, 08-packing-view, 10-e2e-item-table]

# Actuals (#2632) — estimateTokens scale (chars/4 over realized diff)
actuals:
  tokens: 1090
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-branch enumeration-resistant guard: one USER#<callerEmail> presence check returns an identical 404 for both foreign and non-existent trips"
    - "Explicit-field DTO assembly (never spread a DynamoDB record) with conditional optional-key assignment to preserve absent-key semantics"
    - "Storage-attribute -> DTO field mapper isolated in apps/api/src/lib/ as a plain side-effect-free module (mirrors lib/dynamodb.ts)"

key-files:
  created:
    - apps/api/src/lib/tripDetail.ts
  modified:
    - apps/api/src/routes/api.ts

key-decisions:
  - "Membership guard returns 404 (never 403) via a single presence check, so foreign and non-existent trips are indistinguishable in status/body/headers (D-02/D-03)"
  - "Identity taken only from request.user.email.trim().toLowerCase(), matching the write-path USER# key normalization so mixed-case JWT emails still match (D-09, guard M4)"
  - "No ProjectionExpression on the Query — the handler needs every item attribute and Name/Status are DynamoDB reserved words that would throw (RESEARCH Pitfall 2)"
  - "mapItemRecord uses conditional assignment, not object spread, so absent optional attributes become absent DTO keys and no internal key (PK/SK/GSI*) can leak (D-04/D-05)"

patterns-established:
  - "Enumeration-resistant read guard pattern for object-scoped authorization"
  - "Cross-phase storage<->DTO contract module (tripDetail.ts) as single source of truth for item attribute names"

requirements-completed: [TRIP-02, TRIP-03]

coverage:
  - id: D1
    description: "GET /trips/:tripId returns a shaped { tripId, tripName, participants, items } for a member and a byte-identical 404 to non-members and callers of non-existent trips (enumeration resistance, IDOR guard)"
    requirement: "TRIP-02"
    verification:
      - kind: unit
        ref: "pnpm type-check (compiles: route typed Promise<TripDetailResponse>, Params: { tripId: string })"
        status: pass
      - kind: manual_procedural
        ref: "guard matrix M1-M4 (foreign/non-existent/member/case-insensitive) — deferred to end-of-phase human-verify per human_verify_mode"
        status: unknown
    human_judgment: true
    rationale: "No automated behavioral test exists for apps/api this phase (E2E deferred to Phase 10). The security contract (byte-identical 404, no 403, no internal-key leak, case-insensitive membership) is only provable by the manual M1-M4 guard matrix run at end-of-phase."
  - id: D2
    description: "Email-keyed identity: membership normalizes request.user.email via trim().toLowerCase(); identity never read from the path param or body"
    requirement: "TRIP-03"
    verification:
      - kind: unit
        ref: "pnpm type-check + code review — callerEmail = request.user.email.trim().toLowerCase(); tripId flows only into the parameterized :pk value"
        status: pass
      - kind: manual_procedural
        ref: "guard matrix M4 (uppercase JWT email -> 200) — deferred to end-of-phase human-verify"
        status: unknown
    human_judgment: true
    rationale: "The case-insensitive membership behavior (M4) requires a real Cognito JWT with mixed-case email; only verifiable via the end-of-phase manual guard matrix."
  - id: D3
    description: "mapItemRecord extracted into apps/api/src/lib/tripDetail.ts as the cross-phase D-04 storage->DTO contract; api.ts consumes it via a .js-suffixed ESM import with no leftover inline copy or unused imports"
    requirement: "TRIP-02"
    verification:
      - kind: unit
        ref: "pnpm type-check + pnpm build + pnpm lint (all green; no unused Item/ItemStatus imports in api.ts)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-08-13
status: complete
---

# Phase 6 Plan 01: Trip Detail Read API & Participation Guard Summary

**Protected `GET /trips/:tripId` endpoint — one DynamoDB Query on `PK=TRIP#<id>`, an email-keyed participation guard returning a byte-identical enumeration-resistant 404, and an explicit-field `TripDetailResponse` with the reusable `mapItemRecord` D-04 contract module.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-13T19:39Z (approx, post-plan)
- **Completed:** 2026-08-13T19:54:43+03:00
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Registered protected `GET /trips/:tripId` inside the `protected_` block, typed `Promise<TripDetailResponse>` with `Params: { tripId: string }`, so `authPlugin` has already populated `request.user`.
- Single `QueryCommand` on `PK = :pk` (parameterized `TRIP#${tripId}`, no `IndexName`, no `ProjectionExpression`) — no raw user string reaches the key expression.
- Enumeration-resistant participation guard: one `USER#${callerEmail}` presence check yields an identical `404 { error: 'Trip not found' }` for both foreign trips and non-existent trips (no 403, no `META#`-presence branch).
- Explicit-field 200 assembly `{ tripId, tripName, participants, items }` — no DynamoDB record ever spread, no internal keys (PK/SK/GSI*) copied.
- Extracted `mapItemRecord` into new `apps/api/src/lib/tripDetail.ts` (the D-04 cross-phase attribute contract Phase 7's writer must match), consumed via a `.js`-suffixed ESM import; dropped the now-unused `Item`/`ItemStatus` imports from `api.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): End-to-end GET /trips/:tripId** - `63eeb97` (feat)
2. **Task 2: Extract mapItemRecord into lib/tripDetail.ts** - `67060e8` (refactor)

_Note: the tracer's `<verify>` (`pnpm type-check`) was re-run end-to-end and passed before expanding to Task 2; behavioral guard matrix M1-M4 is deferred to end-of-phase human-verify per `human_verify_mode: end-of-phase`._

## Files Created/Modified
- `apps/api/src/lib/tripDetail.ts` (created) - Side-effect-free module exporting `mapItemRecord(r): Item`, the storage->DTO field map (D-04) with conditional optional-key assignment.
- `apps/api/src/routes/api.ts` (modified) - Added the `GET /trips/:tripId` route + participation guard; extended the `@packpixie/model` import with `TripDetailResponse`; imports `mapItemRecord` from `'../lib/tripDetail.js'`.

## Decisions Made
None beyond the plan — the plan's decisions (D-02/D-03/D-04/D-05/D-09/D-10) were implemented as specified. `items: []` is the correct expected result this phase (no writer until Phase 7), not a stub.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- The freshly spawned git worktree had no `node_modules`, so `turbo`/`tsc` were absent and the first `pnpm type-check` failed with `turbo: command not found`. Resolved with `pnpm install --frozen-lockfile` (restores already-declared workspace dependencies from the shared pnpm store — environment setup, not a new-package install). All verifications green afterward.
- Pre-existing client bundle chunk-size warning (`> 500 kB`) surfaced during `pnpm build`; unrelated to this plan's files — out of scope, not addressed.

## Known Stubs
None. `items: []` is the specified correct result for this phase (the item write path lands in Phase 7); it is not a stub.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Read path + authorization slice complete; `mapItemRecord`'s attribute names (`Name`/`Qty`/`Weight`/`PackedBy`/`Status`/`Consumable`/`Category`/`CreatedAt`, SK `ITEM#<id>`) are the contract Phase 7's write path MUST match verbatim.
- Behavioral guard matrix M1-M4 must be recorded at end-of-phase human-verify before `/gsd-verify-work` (no automated behavioral test this phase; E2E deferred to Phase 10).

---
*Phase: 06-trip-detail-read-api-participation-guard*
*Completed: 2026-08-13*
