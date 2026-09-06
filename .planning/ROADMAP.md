# Roadmap: PackPixie

## Milestones

- ✅ **v1.0 E2E Testing Infrastructure** — Phases 1–4 (shipped 2026-08-11)
- 🚧 **v2.0 Packing Table MVP** — Phases 5–10 (planned)

## Phases

<details>
<summary>✅ v1.0 E2E Testing Infrastructure (Phases 1–4) — SHIPPED 2026-08-11</summary>

- [x] Phase 1: Playwright Package Foundation (1/1 plans) — verified passed
- [x] Phase 2: Stack Orchestration + DB Initialization (1/1 plans) — verified passed
- [x] Phase 3: GitHub Actions CI Pipeline (1/1 plans) — verified passed
- [x] Phase 4: Baseline E2E Tests (1/1 plans) — verified passed

Full detail: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v2.0 Packing Table MVP (Planned)

**Milestone Goal:** A participant can open a trip and manage its shared packing table — the first genuinely usable slice of the actual PackPixie product. Built security-first: shared model → read API + participation guard → item write API + server-authoritative rules → inline-edit table UI → packing-view filters → E2E coverage.

- [x] **Phase 5: Shared Item Model & Comments Cleanup** - Land the `Item`/trip-detail DTO contract and remove the dead Comments scaffold (completed 2026-08-12)
- [ ] **Phase 6: Trip-Detail Read API & Participation Guard** - Single-query snapshot endpoint gated by an email-keyed 404 guard
- [x] **Phase 7: Item Write API & Server-Authoritative Rules** - Create/edit/delete endpoints with server-enforced invariants and typed numbers (completed 2026-09-05)
- [ ] **Phase 8: Trip-Detail Inline-Edit Table (UI)** - Open a trip page and add, edit, and delete item rows in an inline table
- [ ] **Phase 9: Packing View Filters** - Default `PackedBy = me` view, Status filter, and show-all toggle
- [ ] **Phase 10: E2E Item-Table Coverage** - Playwright happy path with a seeded second participant

## Phase Details

### Phase 5: Shared Item Model & Comments Cleanup

**Goal**: The shared item/trip-detail type contract exists in `@packpixie/model` and the dead Comments scaffold is fully removed, with a green monorepo build.
**Depends on**: Nothing (first phase of v2.0; v1.0 Phase 4 complete)
**Requirements**: MODEL-01, MODEL-02
**Success Criteria** (what must be TRUE):

  1. `@packpixie/model` exports an `Item` type and a `TripDetailResponse` DTO (trip meta + participants + items), with `UsedBy`/`Carried` intentionally excluded from the typed contract.
  2. Both `apps/api` and `apps/client` import the new types and `pnpm type-check` passes across the monorepo.
  3. The Comments scaffold is fully removed — comment API routes, `Comments.tsx`, the comment model, and client comment API functions — with no dangling references.
  4. `pnpm build` is green with nothing unused left behind.

**Plans**: 0/1 plans executed

- [x] 05-01-item-model-comments-cleanup-PLAN.md — Land the Item/TripDetailResponse contract in @packpixie/model and fully remove the dead Comments scaffold; green build + type-check

### Phase 6: Trip-Detail Read API & Participation Guard

**Goal**: A single-query trip-detail read endpoint returns the packing snapshot, gated by an email-keyed participation guard that returns 404 to non-members.
**Depends on**: Phase 5
**Requirements**: TRIP-02, TRIP-03
**Success Criteria** (what must be TRUE):

  1. `GET /trips/:tripId` returns a shaped `{ tripId, tripName, participants, items }` snapshot in a single DynamoDB query, with no internal keys (`PK`/`SK`/`GSI`) leaked to the client.
  2. A user who is not a participant receives 404 (never 403) — reads on foreign and non-existent trips are indistinguishable, so trip existence can't be enumerated.
  3. Membership, `PackedBy`, and the default-view identity all key off the verified JWT email (`request.user.email`); the stale `<UserId>` architecture docs are corrected to email.

**Plans**: 2/2 plans executed

- [x] 06-01-PLAN.md — GET /trips/:tripId read endpoint: single query, email-keyed 404 participation guard, explicit-field TripDetailResponse + reusable item mapper (TRIP-02, TRIP-03)
- [x] 06-02-PLAN.md — Correct dynamoDB-architecture.md + app-architecture.md §5 identity docs from UserId to email (TRIP-03, SC #3)

### Phase 7: Item Write API & Server-Authoritative Rules

**Goal**: Create, edit, and delete item endpoints persist correctly-typed data and enforce the packing invariants server-side, independent of any client.
**Depends on**: Phase 6
**Requirements**: ITEM-04, ITEM-05, ITEM-06
**Success Criteria** (what must be TRUE):

  1. A raw API call cannot set an item's `Status` to `packed` unless `PackedBy` is set — the server rejects the invalid transition regardless of the client.
  2. Clearing `PackedBy` atomically resets the row's `Status` to unset in a single update, so the two can never diverge.
  3. `Quantity` and `Weight` persist as DynamoDB numbers; an unset `Weight` is stored absent (shown blank), distinct from `0`.
  4. Every item mutation requires trip participation and rejects unknown `itemId`s with 404 (no phantom-row upserts).

**Plans**: 1/1 plans executed

- [x] 07-01-PLAN.md — POST/PATCH/DELETE /trips/:tripId/items with a shared, unit-tested invariant core enforcing ITEM-04/05/06 server-side (ITEM-04, ITEM-05, ITEM-06)

### Phase 8: Trip-Detail Inline-Edit Table (UI)

**Goal**: A participant can open a trip at `/trips/:tripId` and add, edit, and delete item rows through an inline-editable table.
**Depends on**: Phase 7
**Requirements**: TRIP-01, ITEM-01, ITEM-02, ITEM-03
**Success Criteria** (what must be TRUE):

  1. A participant can navigate to `/trips/:tripId` (via `react-router-dom`) and see the trip's packing table loaded from the single-query snapshot.
  2. A participant can add an item row that defaults `PackedBy` to the current user and `Status` to unset.
  3. A participant can inline-edit any field of any row (Name, Quantity, Weight, PackedBy, Status, Category, Consumable) and the change persists.
  4. A participant can delete a row after confirming a delete dialog (hard delete, no undo).

**Plans**: 2 plans

Plans:
**Wave 1**

- [ ] 08-01-PLAN.md — Wire client-side routing (`react-router-dom`) + trip-detail read, end-to-end tracer (TRIP-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 08-02-PLAN.md — Full inline-edit item table: add-row, per-field auto-save, delete with confirmation (ITEM-01, ITEM-02, ITEM-03)

**UI hint**: yes

### Phase 9: Packing View Filters

**Goal**: Opening a trip defaults to a personal `PackedBy = me` view, with a Status filter and a show-all toggle, all resolved client-side over the loaded snapshot.
**Depends on**: Phase 8
**Requirements**: VIEW-01, VIEW-02, VIEW-03
**Success Criteria** (what must be TRUE):

  1. Opening a trip defaults the table to a `PackedBy = me` filter, resolved against the current user's email.
  2. A participant can filter the table by Status (to-buy / found / packed / unset).
  3. A participant can toggle show-all to drop the personal filter and see every item in the trip.
  4. All filtering happens client-side over the single loaded snapshot — no extra server round-trips per toggle.

**Plans**: TBD
**UI hint**: yes

### Phase 10: E2E Item-Table Coverage

**Goal**: The Playwright suite exercises the item-table happy path end-to-end, with a seeded second participant so the personal filter is genuinely verified.
**Depends on**: Phase 9
**Requirements**: E2E-01, E2E-02
**Success Criteria** (what must be TRUE):

  1. A Playwright spec covers the item-table happy path: open trip → add item → edit status → delete (with confirmation).
  2. The suite seeds a second participant so the `PackedBy = me` default filter is asserted to exclude another participant's row, and show-all reveals it.
  3. Item specs pass with parallel workers via per-trip isolation (unique trip names, scoped `data-testid` selectors), both locally and in CI.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8 → 9 → 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 5. Shared Item Model & Comments Cleanup | v2.0 | 1/1 | Complete    | 2026-08-12 |
| 6. Trip-Detail Read API & Participation Guard | v2.0 | 2/2 | In Progress|  |
| 7. Item Write API & Server-Authoritative Rules | v2.0 | 1/1 | Complete    | 2026-09-05 |
| 8. Trip-Detail Inline-Edit Table (UI) | v2.0 | 0/2 | Not started | - |
| 9. Packing View Filters | v2.0 | 0/TBD | Not started | - |
| 10. E2E Item-Table Coverage | v2.0 | 0/TBD | Not started | - |
