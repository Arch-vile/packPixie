# Requirements: PackPixie — v2.0 Packing Table MVP

**Defined:** 2026-08-12
**Core Value:** A participant can open a trip and manage its shared packing table — the first genuinely usable slice of the actual PackPixie product.

## v1 Requirements

Requirements for this milestone (v2.0). Each maps to exactly one roadmap phase.

### Shared Model & Cleanup

- [ ] **MODEL-01**: A shared `Item` type and a trip-detail response DTO exist in `@packpixie/model`, consumed by both api and client (`UsedBy`/`Carried` excluded from the typed DTOs)
- [ ] **MODEL-02**: The `Comments` scaffold is fully removed — API routes, `Comments.tsx`, the comment model, and client api functions — with `pnpm type-check` and `pnpm build` green

### Trip Detail Load & Access Control

- [ ] **TRIP-01**: A participant can open a trip at `/trips/:tripId` and see its packing table, loaded in a single query (trip meta + participants + items)
- [ ] **TRIP-02**: Item read and write requests return 404 for any user who is not a participant of the trip (per-request participation guard; 404 not 403, to avoid leaking trip existence)
- [ ] **TRIP-03**: All packing operations derive identity from the verified JWT email; `PackedBy`, the default view, and membership checks key off `request.user.email` (architecture docs corrected from `UserId` to email)

### Item Management

- [ ] **ITEM-01**: A participant can add an item row; it defaults `PackedBy` to the current user and `Status` to unset
- [ ] **ITEM-02**: A participant can edit any field of any item row (Name, Quantity, Weight, PackedBy, Status, Category, Consumable) and the change persists
- [ ] **ITEM-03**: A participant can delete an item row after confirming a delete dialog (hard delete, no undo)
- [ ] **ITEM-04**: An item can be marked `packed` only when `PackedBy` is set — enforced server-side
- [ ] **ITEM-05**: Clearing `PackedBy` atomically resets the row's `Status` to unset — enforced server-side
- [ ] **ITEM-06**: Quantity and Weight persist as numbers; an unset Weight is stored absent (shown blank), distinct from `0`

### Packing View

- [ ] **VIEW-01**: Opening a trip defaults the table to a `PackedBy = me` filter
- [ ] **VIEW-02**: A participant can filter the table by Status (to-buy / found / packed / unset)
- [ ] **VIEW-03**: A participant can toggle to show all items in the trip (dropping the personal filter)

### End-to-End Testing

- [ ] **E2E-01**: The Playwright suite covers the item-table happy path (open trip → add item → edit status → delete)
- [ ] **E2E-02**: E2E seeds a second participant so the `PackedBy = me` filter is genuinely verified (not trivially passing with a single user)

## v2 Requirements

Deferred to future milestones. Tracked but not in this roadmap.

### Usage & Distribution

- **USE-01**: Items carry a `UsedBy` participant set, editable in the table
- **DIST-01**: Distribution section suggests a fair shared-carry plan based on usage
- **DIST-02**: Manual carry overrides that the suggestion algorithm must not change
- **DIST-03**: Split-quantity carrying across multiple participants

### Reuse & Summary

- **COPY-01**: Create a new trip by copying the most recent trip (reuse-first flow)
- **COPY-02**: Participant-change handling during copy (personal-item and non-personal rules)
- **SUM-01**: Summary section overview views (who brings/uses/carries what)

### Collaboration & Filtering

- **COLLAB-01**: Confirmation prompt when editing a row you are not the `PackedBy` of
- **FILTER-01**: Full filter bar (PackedBy, UsedBy, Category, Consumable) + free-text search with AND/OR logic

## Out of Scope

Explicitly excluded from v2.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| `UsedBy` / usage sets (UI or DTO) | Only pays off with Distribution; kept entirely unset this slice, excluded from typed DTOs (schemaless — zero migration cost to add later) |
| `Carried` quantities / Distribution / fairness algorithm | The product's hardest feature; deserves its own milestone once items exist |
| Copy-a-trip reuse flow | Needs items to copy; separate milestone |
| Summary section | Under-specified in the spec (§17); do last, once real data exists |
| Cross-user edit confirmation | Collaboration polish; pairs with the Distribution/collaboration milestone (delete confirmation is the one in-scope exception, since delete is destructive) |
| Full filter bar + free-text search | Everyday essentials (personal + status) cover the MVP; full filters are additive later |
| Optimistic-concurrency / version locking | Last-write-wins acceptable for this slice; keep writes field-scoped so locking drops in later without migration |
| Real-time / polling sync between participants | Out of MVP scope; refetch-on-load is sufficient |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODEL-01 | Phase 5 | Pending |
| MODEL-02 | Phase 5 | Pending |
| TRIP-01 | Phase 8 | Pending |
| TRIP-02 | Phase 6 | Pending |
| TRIP-03 | Phase 6 | Pending |
| ITEM-01 | Phase 8 | Pending |
| ITEM-02 | Phase 8 | Pending |
| ITEM-03 | Phase 8 | Pending |
| ITEM-04 | Phase 7 | Pending |
| ITEM-05 | Phase 7 | Pending |
| ITEM-06 | Phase 7 | Pending |
| VIEW-01 | Phase 9 | Pending |
| VIEW-02 | Phase 9 | Pending |
| VIEW-03 | Phase 9 | Pending |
| E2E-01 | Phase 10 | Pending |
| E2E-02 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16 ✓
- Unmapped: 0

**Phase distribution:**
- Phase 5 (Shared Item Model & Comments Cleanup): MODEL-01, MODEL-02
- Phase 6 (Trip-Detail Read API & Participation Guard): TRIP-02, TRIP-03
- Phase 7 (Item Write API & Server-Authoritative Rules): ITEM-04, ITEM-05, ITEM-06
- Phase 8 (Trip-Detail Inline-Edit Table): TRIP-01, ITEM-01, ITEM-02, ITEM-03
- Phase 9 (Packing View Filters): VIEW-01, VIEW-02, VIEW-03
- Phase 10 (E2E Item-Table Coverage): E2E-01, E2E-02

---
*Requirements defined: 2026-08-12*
*Last updated: 2026-08-12 after roadmap creation (traceability populated)*
