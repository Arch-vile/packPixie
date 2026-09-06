# Phase 8: Trip-Detail Inline-Edit Table (UI) - Context

**Gathered:** 2026-09-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the client-side trip-detail page: a participant navigates to `/trips/:tripId` (via `react-router-dom`, a new client dependency), sees the packing table loaded from Phase 6's single-query `GET /trips/:tripId` snapshot, and can add, inline-edit, and delete item rows against Phase 7's write endpoints (`POST`/`PATCH`/`DELETE /trips/:tripId/items[/:itemId]`).

This phase is **UI only** — no new API endpoints (Phases 6/7 already ship them), no packing-view filters (`PackedBy = me`, Status filter, show-all — Phase 9), no new E2E specs (Phase 10). It is the first phase to introduce client-side routing; today `apps/client` has no router at all and `TripList.tsx` has no navigation out of the trip list.

</domain>

<decisions>
## Implementation Decisions

### Inline-edit interaction model
- **D-01:** Every cell in every row is an **always-editable input/select** — no click-to-edit / view-mode toggle. Simplest state model; matches a spreadsheet-like packing table. — **Reversibility:** reversible.
- **D-02:** **Auto-save per field on blur/change** — each field fires its own `PATCH` independently as soon as it changes (immediately for selects/checkboxes, on blur for text/number inputs), using Phase 7's partial-body `PATCH` endpoint. No per-row explicit Save button, no per-row dirty/pending tracking. — **Reversibility:** costly — switching to a per-row explicit-Save model later means adding dirty-state tracking and a Save/Cancel affordance across every field's change handler, not a local change.
- **D-03:** **Optimistic UI updates** — a field's new value is shown immediately on change; on the `PATCH` response, reconcile with the server-returned item, or roll back the field and surface an error if the write fails (including the 409 conflict case). — **Reversibility:** reversible.
- **D-04:** **Native tab order only** for keyboard navigation between cells (browser default `Tab`/`Shift+Tab`; `Enter` blurs the current input, triggering its save). No custom arrow-key grid navigation. — **Reversibility:** reversible.

### Field input widgets & validation
- **D-05:** `Status` and `PackedBy` are edited via **native `<select>` dropdowns** — `Status`: to-buy / found / packed / (unset); `PackedBy`: the trip's participant list (`TripDetailResponse.participants`) plus an "unassigned" option. The set of valid values is enforced by which options exist; no client-side format validation needed since the server already rejects invalid values (ITEM-04, Phase 7 D-04). — **Reversibility:** reversible.
- **D-06:** `Quantity`/`Weight` are `<input type="number">`. An **empty string represents "unset"** for `Weight` — clearing it sends `null` (matches `PatchItemRequest.weight?: number | null`, clearing the attribute per ITEM-06's absent-not-zero rule); a typed `0` sends the number `0`, genuinely distinct from blank. `Quantity` has no unset state and always holds a number. — **Reversibility:** reversible.
- **D-07:** `Name` **blocks the auto-save `PATCH` client-side when trimmed-empty**, with a visual flag (e.g. red outline) until a value is entered. The write API does not itself reject empty names, so this is a client-only guard against meaningless blank rows appearing in a shared table. — **Reversibility:** reversible.
- **D-08:** `Consumable` is a plain **checkbox** — a direct fit for `Item.consumable: boolean`; no alternative control was considered. — **Reversibility:** reversible.

### Claude's Discretion
Two gray areas were surfaced during `present_gray_areas` but the user chose not to discuss them this session (`Conflict handling (409)`, `Add-row & delete UX`). They are **in scope for Phase 8** (not deferred) — the planner should resolve them, guided by the decisions above and prior-phase context:

- **Conflict handling (409):** Phase 7 returns `409 { error: 'Item was modified concurrently — refresh and retry' }` for two invariant-protecting races (deleting a packed item, packed-without-PackedBy in either direction). Given D-03's optimistic-update model, the natural pairing is: on 409, roll back the optimistic value, surface the server's error message inline on the affected row, and offer a way to refresh (re-fetch the trip-detail snapshot) rather than a blind auto-retry (which risks looping on a genuine write race).
- **Add-row UX:** Where "add item" lives (a persistent blank row at the bottom vs. a button that inserts one) is undecided. Per D-01, a new row is immediately editable (no separate creation step). New-row defaults are already locked: `PackedBy` = current user, `Status` = unset (REQUIREMENTS.md ITEM-01).
- **Delete UX:** Dialog style (native `confirm()` vs. a custom modal) is undecided — ITEM-03 requires *a* confirmation, not a specific style. Per Phase 7 D-09, deleting a `packed` item is rejected server-side with 400 (`'Cannot delete a packed item — unpack it first'`) — planner should decide whether to pre-emptively disable the delete control on packed rows (avoids a wasted round-trip) or let the click through and surface the 400; either satisfies ITEM-03.
- **Trip-list → trip-detail navigation:** `react-router-dom` is locked (STATE.md), but the exact affordance in `TripList.tsx` (clicking the row vs. a dedicated "Open" link) wasn't discussed.
- **404 handling on the trip-detail fetch:** Not discussed — planner should decide the UI treatment for a non-member or unknown `tripId` (redirect to the trip list vs. an inline "not found" message), consistent with Phase 6 D-02's 404-not-403 contract (never reveal *why* — same UI for both cases).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data model & write contract (this phase's UI targets)
- `packages/model/src/item.ts` — `Item`, `ItemStatus`, `CreateItemRequest`, `PatchItemRequest`, `TripDetailResponse`. Build every form/cell against these exact shapes; `PatchItemRequest` fields are optional/nullable — `null` clears a field (grounds D-06).
- `apps/api/src/routes/api.ts` — `GET /trips/:tripId` (~L231), `POST /trips/:tripId/items` (~L287), `PATCH`/`DELETE /trips/:tripId/items/:itemId` (~L343, ~L478) — the exact endpoints this phase's client calls.

### Prior phase decisions (locked)
- `.planning/phases/05-shared-item-model-comments-cleanup/05-CONTEXT.md` — D-01 (camelCase DTO), D-04 (absent = unset).
- `.planning/phases/06-trip-detail-read-api-participation-guard/06-CONTEXT.md` — D-02 (email-keyed 404 guard — non-member and unknown-trip responses must be indistinguishable), D-04 (storage↔DTO field map).
- `.planning/phases/07-item-write-api-server-authoritative-rules/07-CONTEXT.md` — D-01 (single PATCH handles a whole row), D-04 (`PackedBy` must be a real participant, 400 otherwise), D-06/D-07 (last-write-wins; no optimistic concurrency — the two 409 races are the sole exception), D-08/D-09 (hard delete; deleting a `packed` item is rejected with 400).

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — TRIP-01, ITEM-01, ITEM-02, ITEM-03.
- `.planning/ROADMAP.md` — Phase 8 goal and success criteria (react-router navigation, add/edit/delete rows, delete confirmation dialog).

### Project state & flagged concerns
- `.planning/STATE.md` — Blockers/Concerns: router-vs-`useState` (locked to react-router-dom) and the inline-edit React state model (keying, focus, optimistic reconcile) flagged as needing a design pass (addressed by D-01–D-04 above); the 409 conflict-handling requirement (addressed under Claude's Discretion above).

### Conventions
- `CLAUDE.md` — identity always from verified JWT claims; "leave nothing unused behind."
- `.planning/codebase/CONVENTIONS.md` — client error-state pattern (`useState<string | null>`, reset-try-catch-finally, inline JSX rendering, not toast), named exports for reusable components / default exports for page-level components, Props interface declared immediately above its component.
- `.planning/codebase/STRUCTURE.md` — "New React component" convention: `apps/client/src/<ComponentName>.tsx`, PascalCase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/client/src/api/api.ts` — `getAuthHeaders()` + `fetch` pattern to extend with `getTripDetail(tripId)`, `createItem`, `patchItem`, `deleteItem` functions, following the existing `getTrips`/`createTrip` shape.
- `apps/client/src/TripList.tsx` — existing `<ul>`/`<li>` list-rendering and form patterns are a style reference for the item table and add-row form; currently has **no click-through** to any trip-detail route.
- `.planning/codebase/CONVENTIONS.md` error-handling pattern — directly reusable for the trip-detail fetch and every item mutation.

### Established Patterns
- Client error state: `useState<string | null>(null)`, reset at the start of each async operation, rendered inline in JSX.
- API client functions centralized in `api/api.ts`, verb-prefixed (`getX`/`postX`/`patchX`/`deleteX`); components call these rather than `fetch()` directly.
- Props interfaces declared immediately above the consuming component.

### Integration Points
- `apps/client/package.json` — **`react-router-dom` is not yet a dependency**; this phase adds it (locked decision, STATE.md).
- `apps/client/src/App.tsx` — currently a flat `Authenticator` → `AppContent` shell with no router; this phase introduces `<Routes>`/`<Route>` here (or a wrapping `<BrowserRouter>`).
- `apps/client/src/TripList.tsx` — needs a navigate-to-detail action added to each trip row.
- `apps/client/src/api/api.ts` — add the four new API functions (get trip detail, create/patch/delete item).
- New component(s) for the trip-detail page and item table — file layout is the planner's call, following the existing one-component-per-file convention.

</code_context>

<specifics>
## Specific Ideas

- Every recommended default was confirmed across both discussed areas — no divergent custom requests this session.
- The exact 409 error body from Phase 7 is `{ error: 'Item was modified concurrently — refresh and retry' }` — useful verbatim for the planner's error-display design (see Claude's Discretion: Conflict handling).

</specifics>

<deferred>
## Deferred Ideas

- **`PackedBy = me` default view, Status filter, show-all toggle** → Phase 9 (VIEW-01/02/03), resolved client-side over this phase's loaded snapshot.
- **E2E coverage of the item table** (add → edit → delete happy path, second-participant seeding) → Phase 10 (E2E-01/02).

### Reviewed Todos (not folded)
- **`2026-08-13-paginate-trip-detail-query-for-participation-guard.md`** — Paginate `GET /trips/:tripId` so the participation guard can't be truncated on large trips. Backend hardening on a route already shipped in Phase 6, not a UI concern — left as a separate pending todo.
- **`2026-09-04-add-fastify-schema-validation-write-routes.md`** — Add Fastify `schema.body` validation to the item/trip write routes. Backend hardening on Phase 7's routes, not a UI concern — left as a separate pending todo.

</deferred>

---

*Phase: 8-Trip-Detail Inline-Edit Table (UI)*
*Context gathered: 2026-09-06*
