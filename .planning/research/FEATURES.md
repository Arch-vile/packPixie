# Feature Research

**Domain:** Collaborative trip-packing table (shared, multi-participant item list) — v2.0 Packing Table MVP slice
**Researched:** 2026-08-11
**Confidence:** HIGH — derived from the authoritative product spec (`app-description.md`, esp. §5, §10, §16) and cross-checked against the live data model (`dynamoDB-architecture.md`) and existing code (`apps/api`, `apps/client`, `packages/model`).

> **Scope note (read first).** This is a *subsequent-milestone* slice on top of an existing app (create/list trips + Cognito auth already ship). It adds ONLY the in-scope packing-table behaviors below. The full product spec describes a much larger system (UsedBy usage-sets, Distribution/fairness, copy-a-trip, Summary, cross-user confirmation, full filter bar). Those are **deferred** and must NOT leak into designs. Wherever the spec's rules reference `UsedBy` or `Carried`, this milestone applies only the subset that touches the seven in-scope columns.

> **Identity grounding.** In the current implementation a participant is identified by **email** (`SK = USER#<email>`, `GSI1PK = USER#<email>`), and the verified current user comes from the JWT (`request.user.email`). The DynamoDB doc's `<UserId>` is that email. Therefore `PackedBy` stores a participant email, and "`PackedBy = me`" resolves to `request.user.email`. Any REQ that says "current user" means this verified email.

---

## In-Scope Column Set (the seven fields)

| Column | Type | Editable this slice | Notes |
|--------|------|---------------------|-------|
| Name | string (required, non-empty) | ✅ | Free text. The only strictly-required field to create a meaningful row. |
| Quantity (`Qty`) | positive integer | ✅ | Units of the same item. Sensible default `1`. |
| Weight (g) | non-negative number, nullable | ✅ | **Per-unit** weight in grams (spec §10.7). May be blank/unknown. |
| PackedBy | participant email, nullable | ✅ | Responsibility to bring. Drives personal-view visibility. `null` = unassigned. |
| Status | enum `{unset, to-buy, found, packed}` | ✅ | Row-level packing progress. `packed` gated on PackedBy. |
| Category | free-text string, nullable | ✅ | e.g. "Food", "Gear". No preset list required for MVP. |
| Consumable | boolean, default `false` | ✅ | Property of the item; settable on any row. |

**Data-model columns that exist but are OUT of the UI this slice:** `UsedBy` (String Set), `Carried` (Map). The backend may still keep/default them invisibly (see Open Questions), but no UI reads or writes them in v2.0.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these makes the packing table feel broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Add row** into the trip's shared table | Empty trip is useless; adding items is the core action (spec §10.5) | LOW | Creates a normal trip Item row directly in the trip. No item library. New row appears immediately in the adder's personal view because PackedBy defaults to them. |
| **Inline-edit each of the 7 fields** | It's a table; users expect to click a cell and change it | MEDIUM | Each field is a mutation → `UpdateItem` (`PK=TRIP#<id>`, `SK=ITEM#<id>`). Text (Name/Category), number (Qty/Weight), select (Status), participant-select (PackedBy), checkbox (Consumable). |
| **Delete row** | Wrong/unneeded items must be removable (spec §11.1 "deleting the item") | LOW | Hard delete of the Item entity. No soft-delete/undo required for MVP. |
| **Persist edits to backend** | Shared table must survive reload & be visible to other participants | LOW–MEDIUM | Per-field `UpdateItem`. Client state updates instantly; mutation in background (spec §5 handling-updates). |
| **Default personal view (`PackedBy = me`)** on entering trip | First question is "what am I bringing?" (spec §10.2, §4.2) | LOW | A *pre-applied filter*, not a separate mode. Client-side filter over the single-query load. |
| **Status filter** within the table | After personal view, filtering my items by status is the top refinement (spec §10.9) | LOW | Filter rows to one status (or "not packed"). All status slices must be equally easy — no single slice privileged. |
| **Show-all toggle** | Escape hatch from personal view to see the whole shared list | LOW | Clears the `PackedBy = me` filter → shows all rows regardless of PackedBy. Simplified stand-in for the deferred shared-view. |
| **Empty state** when trip has no items | Blank table needs a prompt to add the first row | LOW | "No items yet — add your first." |
| **Rule: `packed` requires `PackedBy`** | Can't be "packed" if nobody's bringing it (spec §5.9, §16.4) | LOW | Enforce on Status change: block/disable `packed` when PackedBy is empty. |
| **Rule: clearing `PackedBy` resets Status** | Unassigned item has no meaningful packing progress (spec §16.3, scoped) | LOW | On PackedBy → null, set Status → unset. (Spec also resets UsedBy/Carried; those are out of UI, handle per Open Questions.) |
| **Rule: new-row default `PackedBy = me`** | Makes the common "I'm adding something I'll bring" case one click (spec §10.6) | LOW | New row is immediately assigned to the current user and thus visible in their default view. |

### Differentiators / Nice-to-Have (valued but not required for THIS slice)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Optimistic UI (instant edit, background persist with rollback on error) | Feels snappy; matches spec §5 "UI state updates instantly" | MEDIUM | Nice, but simple await-then-refresh is acceptable for MVP. Adds rollback/error-toast complexity. |
| "Not-me-this-time" ergonomics | Clearing your own PackedBy leaves row in show-all but drops it from your view (spec §11.2) | LOW | Falls out naturally from the reset rule + visibility model; worth an explicit test. |
| Category autocomplete / suggested presets | Keeps categories consistent for later filtering | LOW–MEDIUM | Spec keeps Category free-text; presets are pure convenience. Defer unless cheap. |
| Column sort (by name/status/weight) | Easier scanning of longer lists | LOW | Client-side; not required for MVP. |
| Combined status multi-select ("anything not packed") | Spec §10.9 notes users care about "not yet packed" | LOW | A single-status filter satisfies MVP; multi-select is an enhancement. |
| Inline validation messaging (bad qty/weight) | Prevents silent bad data | LOW | Basic input constraints (min 0/1, numeric) cover most of it. |
| Keyboard-fast add (Enter commits new row) | Bulk entry is faster | LOW | Mirrors the existing email-chip UX in `TripList.tsx`. |

### Anti-Features (in scope-creep territory — explicitly NOT this slice)

| Feature | Why Requested | Why Problematic Here | Alternative |
|---------|---------------|----------------------|-------------|
| **UsedBy editing / usage sets** | It's in the data model and the broader spec | Pulls in shared-fairness semantics; out of milestone scope | Leave `UsedBy` untouched by the UI; handle defaults invisibly (Open Questions). |
| **Distribution / Carried quantities / fairness** | Core long-term value of the product | Large algorithm surface; explicitly deferred | No Distribution section, no `Carried` UI this slice. |
| **Copy-a-trip reuse flow** | Primary trip-creation model (spec §7) | Whole separate flow with participant-change rules (§8) | Blank trip + manual add only for now. |
| **Summary section** | Group overview | Spec §17 itself is unfinalized | Omit entirely. |
| **Cross-user edit confirmation dialog** | Spec §15: confirm when editor ≠ PackedBy | Adds modal/confirm plumbing; deferred by milestone | Permissive edit (any participant edits any row) with **no** confirmation this slice. |
| **Full filter bar + free-text search** | Spec §10.8 (PackedBy/CarriedBy/UsedBy/Status/Category/Consumable + search, OR/AND logic) | Rich filter engine; deferred | Only `PackedBy = me`, a Status filter, and show-all. |
| **Multi-select participant filters** | Part of full filter bar | Same as above | Single implicit "me" vs "all". |
| **Real-time / live collaborative sync** | Shared table implies liveness | WebSockets/polling infra not in scope | Last-write-wins via `UpdateItem`; changes seen on reload/refetch. |
| **Per-unit / partial status tracking** | Big-qty rows | Spec §5.9 explicitly: Status is row-level only in MVP | One Status per row. |
| **Soft-delete / undo** | Safety net | Extra state; not required | Hard delete; re-add if needed. |

---

## State-Transition Rules — IN SCOPE (precise, testable)

These are the authoritative rules for this slice, scoped down from spec §16 to the seven-column UI. UsedBy/Carried effects are noted as backend-only where the spec includes them.

1. **New-row defaults (spec §10.6, scoped).**
   On add: `PackedBy = current user (request.user.email)`. Row appears immediately in the adder's `PackedBy = me` view.
   *Backend-only:* spec also defaults `UsedBy = {current user}`; no UI. Status default is **unspecified** by the spec (see Open Questions) — recommend `unset` (or `to-buy`).

2. **Setting `PackedBy` on a previously-unassigned row (spec §16.1, scoped).**
   The item becomes "actively assigned to be brought." No other in-scope field changes.
   *Backend-only:* spec defaults `UsedBy = {PackedBy}` if not already a valid choice; no UI.

3. **Changing `PackedBy` from one participant to another (spec §16.2, scoped).**
   Nothing else changes in the UI. Status is preserved. (The spec's UsedBy "auto-default follows" exception is UsedBy-only → out of UI this slice.)

4. **Clearing `PackedBy` → null (spec §16.3, scoped).**
   Reset **Status → unset**. Keep Name, Quantity, Weight, Consumable, Category. Row leaves the `PackedBy = me` view but remains visible under show-all ("not me this time", spec §11.2).
   *Backend-only:* spec also resets UsedBy and Carried; no UI.

5. **`packed` requires `PackedBy` (spec §5.9, §16.4).**
   A row may be set to Status `packed` only if `PackedBy` is non-null. Attempting to set `packed` with no PackedBy is blocked (disabled option / rejected mutation). Corollary: `to-buy` and `found` are allowed regardless of PackedBy.

**Invariants to test:**
- No row can simultaneously have `Status = packed` AND `PackedBy = null`.
- After clearing PackedBy, Status is always `unset`.
- A freshly added row has `PackedBy = <adder email>` and is visible in that user's default view.
- Quantity ≥ 1; Weight ≥ 0 or blank.

---

## Default View + Filter Behavior (testable)

- **Single-query load.** Entering a trip issues one `Query` (`PK = TRIP#<id>`) returning meta + participants + all items; the client filters in-memory and never re-hits the DB for filter/toggle changes (spec §10, dynamoDB §4.A).
- **Default filter on open:** `PackedBy == request.user.email`. This is the initial state, not a separate screen (spec §10.2).
- **Status filter:** narrows visible rows to a chosen status (`to-buy` | `found` | `packed`, and ideally an "unset/not-packed" option). Combines with the PackedBy filter using AND (only your items, of that status). No status slice is privileged (spec §10.9).
- **Show-all toggle:** ON = ignore the `PackedBy = me` filter (show every row); OFF = re-apply personal filter. Status filter, if set, still applies. This is the only shared-context affordance in scope (the UsedBy≥2 "shared view" of spec §10.4 is deferred).
- **Interaction to test:** clearing your own PackedBy while in default view makes the row disappear from the list (visibility is PackedBy-driven) but reappear when show-all is ON.

---

## Feature Dependencies

```
Trip detail page ("enter a trip", single-query load)
    └──required by──> Item table render
                          ├──required by──> Add row / Inline edit / Delete
                          │                     └──required by──> State-transition rules
                          └──required by──> Default PackedBy=me view
                                                ├──enhanced by──> Status filter
                                                └──enhanced by──> Show-all toggle

PackedBy field ──drives──> Personal-view visibility  &  packed-status gate
Status enum   ──gated by──> PackedBy (packed only)
Participants list (existing) ──feeds──> PackedBy select options
Remove Comments scaffold ──independent──> (cleanup, no runtime dependency)
```

### Dependency Notes
- **Item CRUD requires the trip-detail load:** rows can only be shown/edited once the single-query workspace exists. (Note: the client currently has **no router**; `App.tsx` renders `TripList` directly — routing/trip-detail is a prerequisite for this slice.)
- **State rules require PackedBy + Status editors:** the correctness rules are enforced at the edit boundary of those two fields.
- **PackedBy select requires the participants list:** already delivered by the same single-query load; options = trip participant emails.
- **Comments removal is independent:** endpoint + `Comments.tsx` + `comment.ts` model can be deleted without touching the table (do it as its own cleanup per CLAUDE.md "leave nothing unused").

---

## MVP Definition

### Launch With (v2.0)
- [ ] Trip-detail page with single-query load (meta + participants + items) — prerequisite for everything
- [ ] Add row (defaults PackedBy = me) — core action
- [ ] Inline-edit all 7 fields (Name, Qty, Weight, PackedBy, Status, Category, Consumable) — it's a table
- [ ] Delete row — remove unneeded items
- [ ] Persist edits via `UpdateItem` — shared/durable
- [ ] Default `PackedBy = me` view — personal-default working model
- [ ] Status filter — top everyday refinement
- [ ] Show-all toggle — shared-context escape hatch
- [ ] Rule: new-row PackedBy default = me
- [ ] Rule: `packed` requires PackedBy
- [ ] Rule: clearing PackedBy resets Status
- [ ] Empty state
- [ ] Remove Comments scaffold (endpoint + component + model)
- [ ] E2E happy path over the item table

### Add After Validation (v2.x, still small)
- [ ] Optimistic UI + error rollback
- [ ] Category autocomplete/presets
- [ ] Column sort, "not packed" multi-status filter
- [ ] Keyboard-fast row entry

### Future Consideration (later milestones — DEFERRED)
- [ ] UsedBy usage-sets editing
- [ ] Distribution + carried quantities + fairness algorithm
- [ ] Copy-a-trip reuse flow (+ participant-change rules)
- [ ] Summary section
- [ ] Cross-user edit confirmation
- [ ] Full filter bar (CarriedBy/UsedBy/Category/Consumable filters + free-text search + OR/AND)
- [ ] Real-time collaborative sync

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Trip-detail single-query load | HIGH | MEDIUM (needs routing) | P1 |
| Add row (+ PackedBy=me default) | HIGH | LOW | P1 |
| Inline edit 7 fields | HIGH | MEDIUM | P1 |
| Delete row | MEDIUM | LOW | P1 |
| Persist via UpdateItem | HIGH | LOW–MEDIUM | P1 |
| Default PackedBy=me view | HIGH | LOW | P1 |
| Status filter | HIGH | LOW | P1 |
| Show-all toggle | MEDIUM | LOW | P1 |
| `packed` requires PackedBy | MEDIUM | LOW | P1 |
| Clearing PackedBy resets Status | MEDIUM | LOW | P1 |
| Remove Comments scaffold | LOW | LOW | P1 (cleanup) |
| E2E item-table coverage | HIGH | MEDIUM | P1 |
| Optimistic UI + rollback | MEDIUM | MEDIUM | P2 |
| Category presets/autocomplete | LOW | LOW–MEDIUM | P3 |
| Column sort / multi-status filter | LOW | LOW | P3 |

**Key:** P1 = must-have for v2.0 · P2 = add when convenient · P3 = future.

---

## Open Questions (flag for requirements)

1. **New-row default Status.** Spec doesn't state it. Recommend `unset` (or `to-buy`). Decide before writing REQs — affects test expectations.
2. **Invisible UsedBy/Carried handling.** Spec §16 resets/defaults UsedBy and Carried alongside the in-scope rules. Since neither is in the UI, decide: (a) backend still maintains the spec's UsedBy/Carried defaults on create/clear (keeps data model spec-consistent for future milestones), or (b) leave them entirely unset until the UsedBy milestone. Recommend (a) — cheap, avoids a future migration — but keep it strictly non-UI.
3. **PackedBy select source.** Options come from the trip's participant emails (from the same load). Confirm display (email vs friendly name — only email exists today).
4. **Concurrency model.** Shared editing = last-write-wins per `UpdateItem`; no conflict UI this slice. Confirm no optimistic-lock requirement.
5. **Delete semantics.** Hard delete confirmed (no undo). Confirm no confirmation dialog required (consistent with permissive/no-confirm decision).

## Sources

- `app-description.md` — authoritative product spec (§5 concepts, §10 Packing section, §16 state transitions; also §4, §11) — HIGH confidence
- `dynamoDB-architecture.md` — item attributes, single-query load, UpdateItem access pattern — HIGH confidence
- `apps/api/src/routes/api.ts`, `apps/api/src/plugins/auth.ts` — participant = email, identity from JWT (`request.user.email`) — HIGH confidence (verified in code)
- `apps/client/src/App.tsx`, `TripList.tsx`, `Comments.tsx`; `packages/model/src/*` — current UI (no router yet), Comments scaffold to remove, no Item type yet — HIGH confidence (verified in code)
- `.planning/PROJECT.md` — v2.0 milestone scope / deferred list — HIGH confidence

---
*Feature research for: collaborative packing-table MVP slice (v2.0)*
*Researched: 2026-08-11*
