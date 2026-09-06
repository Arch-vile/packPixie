---
phase: 08-trip-detail-inline-edit-table-ui
verified: 2026-09-06T13:10:00Z
status: gaps_found
score: 10/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "A participant can add an item row; it defaults PackedBy to the current user and Status to unset (ITEM-01)"
    status: failed
    reason: >
      ItemTable's "+ Add item" handler unconditionally calls
      createItem(tripId, { name: '', packedBy: userEmail }). The server's
      buildCreateItemAttributes rejects any CreateItemRequest whose trimmed
      name is empty with 400 "name is required" (apps/api/src/lib/tripDetail.ts:134-137,
      shipped in Phase 7 commit b6fc4ba, unchanged since). Because the client
      never sends a non-empty name on create, every "+ Add item" click
      receives a 400 from POST /trips/:tripId/items, createItem's client
      wrapper throws "Failed to add item.", and ItemTable's catch block
      surfaces "Failed to save changes. Please try again." near the button
      — no row is ever created. Verified directly by invoking the compiled
      buildCreateItemAttributes with body {name: '', packedBy: 'a@b.com'}:
      returns {ok:false, error:'name is required'}. 08-RESEARCH.md's claim
      that "the server does not reject an empty name on CreateItemRequest"
      (citing apps/api/src/routes/api.ts:314-326 as verification) does not
      match the actual code at that location — the plan was built on an
      incorrect research finding. This is a hard blocker: a brand-new trip
      can never get its first item through this UI.
    artifacts:
      - path: "apps/client/src/ItemTable.tsx"
        issue: "handleAddItem sends { name: '', packedBy: userEmail } to createItem — always rejected by the server"
      - path: "apps/api/src/lib/tripDetail.ts"
        issue: "buildCreateItemAttributes (lines 131-137) requires a non-empty trimmed name on create, with no accommodation for a blank-then-fill-in add-row UX"
    missing:
      - "Resolve the contract mismatch: either relax buildCreateItemAttributes's create-time name check to accept an empty/omitted name (matching the PATCH path's more permissive stance and the client's D-07 blank-name-then-fill UX), or change ItemTable's add flow to send a valid non-empty name up front (and update D-07/UI-SPEC/CONTEXT accordingly)"
      - "Re-verify end-to-end after the fix: clicking \"+ Add item\" actually creates a persisted row with server-issued itemId, PackedBy defaulted to the current user, and Status unset"
      - "Re-run the ITEM-01 sub-truths that depend on add working (adjacency of identical-name rows, append-order, D-07 blank-name-then-fill flow) once creation itself is fixed"
---

# Phase 8: Trip-Detail Inline-Edit Table (UI) Verification Report

**Phase Goal:** Deliver the trip-detail page with a fully inline-editable packing item table — a participant can open a trip at `/trips/:tripId`, see its packing table loaded via the Phase 6 single-query snapshot, add/edit/delete item rows with per-field auto-save and optimistic updates (including 409-conflict recovery), all wired against Phase 7's write endpoints.
**Verified:** 2026-09-06T13:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TRIP-01: Clicking a trip navigates to `/trips/:tripId`, fetches via a single `GET /trips/:tripId`, and renders the trip name + item table | ✓ VERIFIED | `TripList.tsx` wraps each row in `<Link to='/trips/${trip.tripId}'>`; `App.tsx` routes `/trips/:tripId` to `<TripDetail>`; `TripDetail.tsx`'s `fetchTrip` calls `getTripDetail(tripId)` once on mount and renders `trip.tripName` + `<ItemTable>` |
| 2 | TRIP-01: Loading state shows "Loading trip…"; any non-2xx fetch (non-member or unknown tripId) shows identical "Trip not found." + back-link | ✓ VERIFIED | `TripDetail.tsx` lines 46-57; `getTripDetail` (api.ts) throws a fixed string on 404, but the component renders the fixed "Trip not found." copy regardless of the caught message, matching Phase 6 D-02's enumeration-resistant contract |
| 3 | ITEM-01: A participant can click "+ Add item" and a new row appears with `packedBy` defaulted to the current user and `status` unset, server-issued | ✗ FAILED | See Gaps below — the create call is unconditionally rejected by the server |
| 4 | ITEM-01 prohibition: rapid double-click of "+ Add item" must not create duplicate blank rows | ✓ VERIFIED | `handleAddItem` early-returns while `adding` is true; button `disabled={adding}` (moot in practice since creation itself never succeeds, but the guard code is present and correct) |
| 5 | ITEM-02: Editing any field (Name, Quantity, Weight, PackedBy, Status, Category, Consumable) persists via `PATCH` | ✓ VERIFIED | `ItemRow` wires each field's blur/change to `handleFieldChange` → `patchItem(tripId, itemId, {field: value})`; server's `computeItemPatch`/`PATCH /trips/:tripId/items/:itemId` (apps/api/src/routes/api.ts:339-473) applies and returns the updated item |
| 6 | ITEM-02: Clearing Weight sends `null`, distinct from typed `0` | ✓ VERIFIED | `handleWeightBlur`: empty trimmed string → `onFieldChange(itemId, 'weight', null)`; non-empty parses to a number, including `0` |
| 7 | ITEM-02: PATCH reconciliation merges only the changed field, never the whole row | ✓ VERIFIED | `applyFieldUpdate` maps only the targeted `field` on the specific `itemId`; `handleFieldChange` step 3 calls it with only the response's same field |
| 8 | ITEM-02: A 409 conflict rolls back the field and offers a manual "Refresh", never auto-retry | ✓ VERIFIED | `patchItem` (api.ts) throws `ConflictError` carrying the server's verbatim message on 409; `handleFieldChange`'s catch rolls back to `previousValue` and sets a conflict row-error with a "Refresh" button wired to `onRefresh` → `fetchTrip()` |
| 9 | ITEM-03: Delete requires confirming a native `confirm()` dialog; no other path triggers it | ✓ VERIFIED | `handleDeleteItem` gates on `window.confirm(...)`, returns early if not confirmed; no other handler calls `deleteItem` |
| 10 | ITEM-03: Delete is disabled with a tooltip on packed rows | ✓ VERIFIED | Delete `<button>` `disabled={item.status === 'packed'}`, `title="Unpack item before deleting"` when packed |
| 11 | ITEM-03: A delete against an already-gone item (404) is a silent no-op, not a spurious error | ✓ VERIFIED | `deleteItem` (api.ts) resolves normally when `response.status === 404`; `handleDeleteItem`'s single success path removes the row from state either way |

**Score:** 10/11 truths verified (1 failed, 0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/client/src/TripDetail.tsx` | Fetch-on-mount page rendering loading/error/success + `ItemTable` | ✓ VERIFIED | Present, substantive, wired into `App.tsx`'s route |
| `apps/client/src/ItemTable.tsx` | Inline-edit table: add/edit/delete | ✓ VERIFIED (partial behavior gap) | Present, substantive, wired; edit/delete paths correct, add path broken (see gap) |
| `apps/client/src/api/api.ts` | `getTripDetail`, `createItem`, `patchItem`, `deleteItem`, `ConflictError` | ✓ VERIFIED | All five present, exported, and match the server's request/response shapes for GET/PATCH/DELETE; `createItem`'s shape is correct but the *value* it is called with (empty name) is the defect, not the function itself |
| `apps/client/src/App.tsx` | `BrowserRouter`/`Routes`/`Route path="/trips/:tripId"` | ✓ VERIFIED | Present and wired |
| `apps/client/src/TripList.tsx` | Whole-row-click navigation | ✓ VERIFIED | Each `<li className="trip-item">`'s content wrapped in `<Link>` |
| `apps/client/package.json` | `react-router-dom` dependency | ✓ VERIFIED | `react-router-dom@7.18.2` present (exact pin, deviation documented and justified in 08-01-SUMMARY.md) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `TripList.tsx` row click | `TripDetail.tsx` | `<Link to='/trips/:tripId'>` → `<Route>` → `useParams` → `getTripDetail` | ✓ WIRED | Confirmed by code trace; `pnpm build`/`type-check` green |
| `ItemTable`'s field blur/change | `PATCH /trips/:tripId/items/:itemId` | `handleFieldChange` → `patchItem` | ✓ WIRED | Confirmed; server route exists and applies the exact field set |
| `ItemTable`'s "+ Add item" | `POST /trips/:tripId/items` | `handleAddItem` → `createItem` | ⚠️ WIRED BUT FAILS AT RUNTIME | The call reaches the endpoint correctly, but the endpoint always rejects the payload sent (empty `name`) — see Gaps |
| `patchItem`'s 409 branch | `ItemTable`'s conflict UI | `ConflictError` → catch → rollback + Refresh → `onRefresh` → `fetchTrip` | ✓ WIRED | Confirmed by code trace |
| `ItemTable`'s delete | `DELETE /trips/:tripId/items/:itemId` | `handleDeleteItem` → `deleteItem` | ✓ WIRED | Confirmed; 404 absorbed as success client-side, matching server's plain 200/404 responses |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| TRIP-01 | 08-01 | Open trip at `/trips/:tripId`, see packing table via single-query snapshot | ✓ SATISFIED | Routing + fetch + render confirmed wired end-to-end |
| ITEM-01 | 08-02 | Add item row defaulting PackedBy/Status | ✗ BLOCKED | Server unconditionally rejects the empty-name create payload the client sends — see Gaps |
| ITEM-02 | 08-02 | Inline-edit any field, persists | ✓ SATISFIED | PATCH wiring, field-scoped reconciliation, 409 handling all confirmed correct |
| ITEM-03 | 08-02 | Delete after confirmation, hard delete | ✓ SATISFIED | Confirm-gate, packed-row guard, 404-idempotency all confirmed correct |

No orphaned requirements — REQUIREMENTS.md's Phase 8 row (TRIP-01, ITEM-01, ITEM-02, ITEM-03) matches exactly what the two plans declared.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, no stub returns, and no hardcoded-empty props found in any of the six files this phase modified.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Client type-check | `pnpm --filter client type-check` | exit 0, no errors | ✓ PASS |
| Client lint | `pnpm --filter client lint` | exit 0, no errors | ✓ PASS |
| Root build (all 4 packages) | `pnpm build` | exit 0, all 4 packages built/cached | ✓ PASS |
| API unit tests (Phase 7 baseline, run once) | `pnpm --filter api test` | 46/46 pass | ✓ PASS |
| **Direct reproduction of the ITEM-01 defect** | `node` invoking compiled `buildCreateItemAttributes({..., body: {name: '', packedBy: 'a@b.com'}})` | `{"ok":false,"error":"name is required"}` | ✗ FAIL — confirms the gap |

No client-side test framework exists for `apps/client` (consistent with 08-VALIDATION.md); the plan's own `<human-check>` blocks are the intended manual UAT path and are harvested below.

### Human Verification Required

These items are the plan-declared manual UAT checks (deferred to end-of-phase per workflow convention). They should be exercised **after** the ITEM-01 gap above is fixed, since the add-item check cannot pass in the current build:

1. **TRIP-01 navigation + not-found (08-01 Task 2)**
   **Test:** Sign in, click a trip card; separately navigate to `/trips/<made-up-uuid>`.
   **Expected:** URL changes to `/trips/{tripId}`, trip name + items render, one `GET /api/trips/{tripId}` visible in Network tab; made-up UUID shows "Trip not found." + "Back to my trips" link.
   **Why human:** No client test framework; requires visual/network confirmation.

2. **ITEM-01/ITEM-02 inline-edit + reload persistence (08-02 Task 2)** — *currently blocked by the ITEM-01 gap; add-item cannot be exercised until fixed*
   **Test:** Click "+ Add item"; edit every field on the new row; reload the page.
   **Expected:** Row appears with correct defaults; every field's value survives reload; Weight-cleared shows blank not `0`; blank Name shows a red outline and does not persist.
   **Why human:** Requires a real browser session against the live API; currently cannot even reach this checkpoint since the row is never created.

3. **ITEM-03 delete confirmation + packed-row guard (08-02 Task 3)**
   **Test:** Delete a non-packed row and confirm; set another row's Status to "packed" and attempt delete; reload after the first delete.
   **Expected:** Confirmed row permanently gone after reload; packed row's delete control visibly disabled with tooltip on hover.
   **Why human:** Native dialog interaction and hover-tooltip both require visual/interactive confirmation.

### Gaps Summary

One blocking gap: **ITEM-01 ("add item row") is fully non-functional.** `ItemTable.handleAddItem` sends `POST /trips/:tripId/items` with `{ name: '', packedBy: userEmail }`. The server's `buildCreateItemAttributes` (a Phase 7 artifact, unchanged since commit `b6fc4ba`) unconditionally rejects an empty/blank `name` with `400 name is required`. This was independently reproduced by invoking the compiled validation function directly with the exact payload the client sends. Every "+ Add item" click therefore fails with "Failed to save changes. Please try again." near the button, and no item row is ever created through this UI — meaning a brand-new trip can never get its first item.

Root cause: 08-RESEARCH.md asserted "the server does not reject an empty name on CreateItemRequest" and cited a code location that, on inspection, does not support that claim — the plan was built on this incorrect premise, so nothing in the executor's own verification loop (type-check/lint/build, which say nothing about payload semantics) could have caught it. Phase 6/7's own review and Phase 8's code review (08-REVIEW.md) also did not catch this cross-phase contract mismatch.

This is not an intentional deviation — no override is suggested. The two straightforward remediation paths are (a) relax the server's create-time name validation to match its own PATCH path's more permissive stance, since the client's D-07 blank-then-fill UX already assumed this, or (b) change the client's add-item call to never send an empty name. Either requires a follow-up plan; ITEM-02 and ITEM-03 are otherwise correctly implemented and require no changes.

---

*Verified: 2026-09-06T13:10:00Z*
*Verifier: Claude (gsd-verifier)*
