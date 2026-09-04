# Phase 7: Item Write API & Server-Authoritative Rules - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Add create, edit, and delete endpoints for trip items to `apps/api`, enforcing packing invariants **server-side** so they hold regardless of client (ITEM-04, ITEM-05, ITEM-06). This phase is **API only** — no UI (Phase 8), no filters (Phase 9), no new E2E specs (Phase 10). It builds directly on the `Item`/`TripDetailResponse` contract locked in Phase 5 and the storage-attribute mapping (`Name`/`Qty`/`Weight`/`PackedBy`/`Status`/`Consumable`/`Category`, SK `ITEM#<id>`, `CreatedAt`) locked in Phase 6 D-04, which this phase's writer must match exactly.

</domain>

<decisions>
## Implementation Decisions

### Endpoint shape & routing
- **D-01:** REST-ish routes under the trip resource: `POST /trips/:tripId/items` (create), `PATCH /trips/:tripId/items/:itemId` (partial update — handles all edit cases including status/PackedBy changes in one endpoint, no separate status-only route), `DELETE /trips/:tripId/items/:itemId` (delete). Registered in the same protected scope as the Phase 6 `GET /trips/:tripId` route. — **Reversibility:** costly — this is the public API shape Phase 8's client will call against.
- **D-02:** New item ids are generated with `crypto.randomUUID()` (Node built-in, no dependency). Used as the `ITEM#<id>` SK suffix, matching Phase 6 D-04's mapper (`itemId` ← strip `ITEM#` prefix from `SK`). No sort-order guarantee is derived from the id itself — item ordering (if ever needed) would rely on `CreatedAt` or client-side sort, not id lexical order. — **Reversibility:** reversible — internal id-generation choice, not exposed as a format contract.

### Validation & error responses
- **D-03:** Invalid requests return `400` with a structured, human-readable error body matching the existing convention: `reply.status(400).send({ error: '<specific message>' })` — one specific message per violated rule (e.g. `'packed requires PackedBy to be set'`), not a generic message. — **Reversibility:** reversible.
- **D-04:** `PackedBy` must reference an actual trip participant: the server checks the target email is one of the trip's `USER#<email>` records (same records the Phase 6 guard reads) and rejects with 400 otherwise. Comparison uses lowercased email per the existing convention (Phase 6 D-02, Phase 5 D-05). — **Reversibility:** reversible.
- **D-05:** `PATCH` rejects unknown/extra fields in the request body with 400, rather than silently ignoring them. Only the known `Item` DTO fields (name, quantity, weight, packedBy, status, category, consumable) are accepted; anything else (including attempts to set internal keys) is rejected. — **Reversibility:** reversible.
- Standing invariant restated from ROADMAP success criteria: `Status = 'packed'` is rejected unless `PackedBy` is set in the resulting state (ITEM-04); clearing `PackedBy` atomically resets `Status` to unset in the same update (ITEM-05); every mutation requires trip participation and unknown `itemId`s return 404, no phantom-row upserts (roadmap SC #4).

### Concurrency & atomicity
- **D-06:** The `PackedBy`-clear-resets-`Status` rule is implemented as read-then-write: fetch the current item, compute the resulting field set server-side (if the incoming update clears `PackedBy`, the computed update also clears/removes `Status`), then issue a single `UpdateItem` with that computed expression. There is a small race window between the read and the write; see D-07 for why this is accepted. — **Reversibility:** reversible — internal handler logic.
- **D-07:** No optimistic concurrency control, no version/updatedAt tokens, no 409s. Two participants editing the same item near-simultaneously is last-write-wins, consistent with PROJECT.md's "shared editing... with cheap correctness rules" model. This is a deliberate simplicity choice for a low-stakes collaborative packing list, not an oversight — do not add locking machinery. — **Reversibility:** reversible, but changing later means introducing a version field across all item writes (touches every write path).

### Delete semantics
- **D-08:** Hard delete — `DeleteItem` removes the row entirely. No soft-delete/tombstone, no `DeletedAt` flag, no undo. — **Reversibility:** one-way per-item (a deleted item's data is gone; no data-model migration needed to add tombstones later, but historical deletes before that point are unrecoverable).
- **D-09:** Deleting a `packed` item is **rejected** with `400` and a clear message (e.g. `'Cannot delete a packed item — unpack it first'`). Any participant can delete any *unpacked* item at any time (no other restriction) — this is the one exception to the otherwise-unrestricted "any participant edits any row" model. — **Reversibility:** reversible — a server-side guard, easy to relax or tighten later.
- Every write (create/edit/delete) requires trip participation (same email-in-`USER#` check as Phase 6's read guard) and returns 404 for both non-member callers and unknown `itemId`s — identical treatment, no phantom-row upserts on PATCH/DELETE of a nonexistent item (roadmap SC #4).

### Claude's Discretion
- Whether the mapper/validation logic added here lives inline in `routes/api.ts` or is extracted into `apps/api/src/lib/tripDetail.ts` (already a candidate location per Phase 6's discretion note) or a new sibling module — planner's call, but the Phase 6 mapper's storage-attribute contract (D-04) must be reused, not re-derived.
- Exact `Weight` write behavior when the client sends `undefined`/omits it entirely on create vs. explicitly clearing it on PATCH — both must result in the attribute being **absent** in storage (never `0` or `null`), per Phase 5/6's absent-key convention; the planner should specify the DynamoDB `REMOVE`-vs-omit mechanics.
- Whether quantity has a default value on create (e.g. defaults to `1`) if the client omits it — not discussed, left to planner/requirements re-check; ITEM-06 only constrains storage typing, not defaulting behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data model & storage semantics
- `dynamoDB-architecture.md` §2 — entity types under one Trip PK (`META#`, `USER#`, `ITEM#`); §3 — item attribute types and the "omit when unassigned" rule this phase's writer must honor; §4 — relevant access patterns for single-item writes.
- `app-architecture.md §5` — superseded by `dynamoDB-architecture.md` per Phase 6 D-08; do not treat its multi-table schema as authoritative.

### Read contract & prior decisions (locked)
- `packages/model/src/item.ts` — the `Item` / `ItemStatus` / `TripDetailResponse` DTO; item writes must produce data the Phase 6 mapper can read back correctly.
- `.planning/phases/05-shared-item-model-comments-cleanup/05-CONTEXT.md` — D-01 (camelCase DTO / PascalCase storage split), D-02 (Item shape), D-04 (absent = unset), D-05 (`packedBy` is a lowercased email), D-06 (participants are emails).
- `.planning/phases/06-trip-detail-read-api-participation-guard/06-CONTEXT.md` — D-02 (email-keyed participation guard pattern, 404-not-403), D-04 (storage-attribute field map this phase's writer MUST match exactly: `Name`/`Qty`/`Weight`/`PackedBy`/`Status`/`Consumable`/`Category`, SK `ITEM#<id>`, `CreatedAt`), D-09/D-10 (route placement, param handling conventions).

### Existing code to match
- `apps/api/src/routes/api.ts` — `GET /trips/:tripId` (Phase 6) shows the participation-guard query pattern and `{ error }` reply convention to reuse for write-path membership checks.
- `apps/api/src/plugins/auth.ts` — `request.user.email` origin and `AuthUser` shape.
- `apps/api/src/lib/dynamodb.ts` — shared `DynamoDBDocumentClient` (`removeUndefinedValues: true`, `wrapNumbers: false`).

### Requirements
- `.planning/REQUIREMENTS.md` — ITEM-04 (packed requires PackedBy), ITEM-05 (clearing PackedBy resets Status), ITEM-06 (Quantity/Weight as numbers, absent Weight distinct from 0).

### Conventions
- `CLAUDE.md` — identity always from `request.user` (never params/body); public vs protected route split in `routes/api.ts`; `.js` extensions on relative imports in `apps/api`; "leave nothing unused behind."

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GET /trips/:tripId` handler (Phase 6) — the participation-guard query and email-comparison pattern is directly reusable for write-path authorization (does the caller's email appear in the trip's `USER#` records).
- `DynamoDBDocumentClient` from `lib/dynamodb.ts` — same client, no new wiring.
- Phase 6's item mapper (storage → DTO) — the inverse (DTO/request → storage attributes) must produce data this mapper can read back identically.

### Established Patterns
- Protected routes live inside the `protected_.register(authPlugin(conf))` block.
- Participant emails are stored/compared lowercased.
- Error responses use `reply.status(N).send({ error: '...' })`.

### Integration Points
- `apps/api/src/routes/api.ts` — add the three new routes (POST/PATCH/DELETE items) here, or delegate handler bodies to a shared module if the planner extracts one.
- No client changes this phase (Phase 8 builds the UI against these endpoints).

### Security-sensitive notes (for the planner's threat model)
- Same enumeration-resistance requirement as Phase 6: unknown `itemId` and non-member caller must be indistinguishable (404 in both cases).
- `PackedBy` cross-check (D-04) prevents writing an arbitrary email into a field that's meant to reference a real participant.
- Server-side invariant enforcement (ITEM-04/05) must hold even if the request body is crafted directly (not just via the future UI) — that's the literal point of this phase per its roadmap goal.

</code_context>

<specifics>
## Specific Ideas

- The single-PATCH-does-everything design (D-01) anticipates Phase 8's inline-edit table saving a whole row's changes in one request.
- Delete-blocks-on-packed (D-09) is a deliberate guard rail against accidentally deleting something already bought/packed — surfaced now so Phase 8's UI can choose to pre-emptively disable/hide delete on packed rows, though that UI decision is Phase 8's to make.

</specifics>

<deferred>
## Deferred Ideas

- **Trip-detail UI table**, wiring these endpoints to inline-edit interactions, and any UI-side handling of the delete-packed-item error → Phase 8 (TRIP-01, ITEM-01/02/03).
- **`PackedBy = me` default view, status filter, show-all toggle** → Phase 9 (VIEW-01/02/03).
- **E2E coverage of item writes** (create → edit status → delete happy path, second-participant seeding) → Phase 10 (E2E-01/02).
- **Optimistic concurrency / versioning**, if ever needed → not scheduled; explicitly rejected for this milestone per D-07.
- **Soft delete / undo**, if ever needed → not scheduled; explicitly rejected per D-08.

### Reviewed Todos (not folded)
None — no matching pending todos found for this phase.

</deferred>

---

*Phase: 7-Item Write API & Server-Authoritative Rules*
*Context gathered: 2026-09-04*
