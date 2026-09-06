# Phase 8: Trip-Detail Inline-Edit Table (UI) - Research

**Researched:** 2026-09-06
**Domain:** React 19 client-side routing (react-router-dom) + auto-save inline-edit table pattern
**Confidence:** HIGH (routing/versioning — verified directly against npm registry) / MEDIUM (auto-save pitfalls — general web patterns, not codebase-specific)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Inline-edit interaction model**
- **D-01:** Every cell in every row is an **always-editable input/select** — no click-to-edit / view-mode toggle. Simplest state model; matches a spreadsheet-like packing table. — **Reversibility:** reversible.
- **D-02:** **Auto-save per field on blur/change** — each field fires its own `PATCH` independently as soon as it changes (immediately for selects/checkboxes, on blur for text/number inputs), using Phase 7's partial-body `PATCH` endpoint. No per-row explicit Save button, no per-row dirty/pending tracking. — **Reversibility:** costly — switching to a per-row explicit-Save model later means adding dirty-state tracking and a Save/Cancel affordance across every field's change handler, not a local change.
- **D-03:** **Optimistic UI updates** — a field's new value is shown immediately on change; on the `PATCH` response, reconcile with the server-returned item, or roll back the field and surface an error if the write fails (including the 409 conflict case). — **Reversibility:** reversible.
- **D-04:** **Native tab order only** for keyboard navigation between cells (browser default `Tab`/`Shift+Tab`; `Enter` blurs the current input, triggering its save). No custom arrow-key grid navigation. — **Reversibility:** reversible.

**Field input widgets & validation**
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

**Note:** `08-UI-SPEC.md` (a downstream design contract, produced after CONTEXT.md) has since resolved most of the above discretion areas concretely — see that document's Copywriting Contract and UI Considerations sections, summarized throughout this research where relevant (e.g. add-row is a "+ Add item" button; delete uses native `confirm()`; 404 renders "Trip not found." with identical copy for both failure modes; navigation is whole-row-click via `<Link>`).

### Deferred Ideas (OUT OF SCOPE)
- **`PackedBy = me` default view, Status filter, show-all toggle** → Phase 9 (VIEW-01/02/03), resolved client-side over this phase's loaded snapshot.
- **E2E coverage of the item table** (add → edit → delete happy path, second-participant seeding) → Phase 10 (E2E-01/02).

**Reviewed Todos (not folded):**
- **`2026-08-13-paginate-trip-detail-query-for-participation-guard.md`** — Paginate `GET /trips/:tripId` so the participation guard can't be truncated on large trips. Backend hardening on a route already shipped in Phase 6, not a UI concern — left as a separate pending todo.
- **`2026-09-04-add-fastify-schema-validation-write-routes.md`** — Add Fastify `schema.body` validation to the item/trip write routes. Backend hardening on Phase 7's routes, not a UI concern — left as a separate pending todo.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| TRIP-01 | A participant can open a trip at `/trips/:tripId` and see its packing table, loaded in a single query (trip meta + participants + items) | Standard Stack (react-router-dom version/compat) + Architecture Patterns 1-3 (routing setup, param reading, navigation) + Code Examples (trip-detail fetch + 404 handling) |
| ITEM-01 | A participant can add an item row; it defaults `PackedBy` to the current user and `Status` to unset | Architecture Patterns, Pattern 4 (add-row via immediate POST) — resolves the `CreateItemRequest.name` required-field nuance not covered by CONTEXT.md/UI-SPEC.md |
| ITEM-02 | A participant can edit any field of any item row (Name, Quantity, Weight, PackedBy, Status, Category, Consumable) and the change persists | Common Pitfalls 2-3 (overlapping requests, 409 handling) + Code Examples (field patch with per-field reconciliation) |
| ITEM-03 | A participant can delete an item row after confirming a delete dialog (hard delete, no undo) | Common Pitfall 4 (confirm() + optimistic state interaction) + `assertItemDeletable` server contract cited in Architecture Patterns / Security Domain |
</phase_requirements>

## Summary

This phase's only genuinely new technical surface is `react-router-dom` — everything else (data model, write endpoints, visual/interaction contract) is already locked by `07-CONTEXT.md`, `08-CONTEXT.md`, and `08-UI-SPEC.md`. The critical finding of this research: **`react-router-dom` and the newer bare `react-router` package are not interchangeable right now**, and the codebase's currently-installed React version makes this a real trap, not a hypothetical one.

`react-router-dom@7.18.3` (the current and *final* major version ever published under that package name) declares peer dependencies `react >=18` / `react-dom >=18` — fully compatible with the project's installed `react@19.1.1` / `react-dom@19.1.1` `[VERIFIED: npm registry]`. Its own README states it is now purely a compatibility re-export of the unified `react-router` package, kept alive to smooth v6→v7 upgrades `[VERIFIED: npm registry — package readme]`. Separately, the bare `react-router` package (no `-dom` suffix) has since released a v8 line (latest `8.3.1`) whose peer dependency floor is `react >=19.2.7` / `react-dom >=19.2.7` — **higher than the project's installed 19.1.1** `[VERIFIED: npm registry]`. Since the user's locked decision (`STATE.md`) is specifically "`react-router-dom`", and `react-router-dom`'s own `latest` npm dist-tag is pinned at `7.18.3` (it never published a v8), the correct install is unambiguous: `react-router-dom@^7.18.3`. The planner must NOT let a task substitute the bare `react-router` package — that would silently pull in an incompatible peer-dependency floor.

For the routing shape itself: React Router v7's **Declarative Mode** (`<BrowserRouter>` / `<Routes>` / `<Route>` / `<Link>` / `useNavigate` / `useParams`, all importable from `react-router-dom`) is the correct fit — it is the mode intended for apps with an existing data layer and no need for route-level loaders/actions/pending-UI, which matches this app's existing `useState` + `api/api.ts` fetch pattern exactly. The alternative, `createBrowserRouter` (Data Mode), buys route-level `loader`/`action`/pending-state machinery this app doesn't use and doesn't need for one added route — it would be net-new architecture for zero phase requirement. `<BrowserRouter>` should wrap the *entire* app, including `<Authenticator>`, not sit inside `AppContent` — this keeps routing available uniformly and matches the general Amplify-UI composition pattern (Provider/Router wrappers outermost, feature content innermost) `[CITED: general community pattern, not Amplify-specific documentation]`.

For the auto-save/optimistic-update pattern in D-01–D-04: no React 19-specific breaking pitfall was found. The generic risks are (1) overlapping in-flight requests when a user tabs rapidly through many fields, and (2) the item **create** flow needing a different mechanism than the item **edit** flow, because `CreateItemRequest.name` is a required string with no meaningful default — this is a concrete, actionable design point surfaced below (see Pattern: Add-row via immediate POST).

**Primary recommendation:** Install `react-router-dom@^7.18.3` (not `react-router`). Wrap the existing `<Authenticator>` shell in `<BrowserRouter>` inside `main.tsx` or the top of `App.tsx`, add `<Routes><Route path="/" .../><Route path="/trips/:tripId" .../></Routes>` inside `AppContent`, and implement "+ Add item" as an immediate `POST` (not an optimistic client-side stub) so every rendered row — new or existing — has a real server-issued `itemId` before any per-field `PATCH` auto-save can fire.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL routing (`/trips/:tripId`) | Browser / Client (SPA) | — | Client-side SPA routing; no SSR tier exists in this stack |
| Trip-detail data fetch (single-query snapshot) | Browser / Client | API / Backend | Client calls the already-shipped `GET /trips/:tripId`; no new backend work this phase |
| Item create/edit/delete | Browser / Client | API / Backend | Client fires `POST`/`PATCH`/`DELETE`; server (Phase 7) owns validation/invariants — client never re-implements them |
| Participation guard (404 vs 403) | API / Backend | Browser / Client | Enforced server-side (Phase 6); client only renders the resulting 404 state, never re-derives membership |
| Optimistic UI reconciliation | Browser / Client | — | Pure client-state concern; no server round-trip needed to decide rollback vs. commit (the PATCH response itself is the source of truth) |
| Auth / identity | API / Backend (JWT verification) | Browser / Client (Amplify `Authenticator`, token attachment) | Identity is already established via `request.user.email` server-side (Phase 6/CLAUDE.md); this phase adds no new auth surface |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `react-router-dom` | `^7.18.3` (verified current/latest under this package name) | Client-side routing — `/trips/:tripId` | De facto standard SPA router for React; this project's locked decision (STATE.md) |

### Supporting
No new supporting libraries needed. This phase deliberately reuses:
- `apps/client/src/api/api.ts` pattern (extend with 4 new functions) — no new HTTP client.
- Native `<table>`/`<input>`/`<select>`/`<button>` — no new UI/component library (locked by `08-UI-SPEC.md`: "Component library: none").
- Native `confirm()` — no new modal/dialog library (locked by `08-UI-SPEC.md`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-router-dom` Declarative Mode (`BrowserRouter`/`Routes`/`Route`) | `createBrowserRouter` (Data Mode) | Data Mode adds `loader`/`action`/`useNavigation` pending-state machinery. Buys nothing for one added route in an app that already has its own `useState`+`fetch` data layer; would be unjustified net-new architecture. |
| `react-router-dom` package | bare `react-router` package | `react-router` v8 (current latest, `8.3.1`) requires `react`/`react-dom` `>=19.2.7` — **incompatible** with this project's installed `19.1.1`. Do not substitute. |
| Auto-save-per-field `PATCH` (locked, D-02) | Explicit per-row Save button | Explicitly rejected by D-02 (costly to reverse) — not re-litigated here. |

**Installation:**
```bash
npm install react-router-dom@^7.18.3
# or, per this monorepo's package manager:
pnpm --filter client add react-router-dom@^7.18.3
```

**Version verification:** Confirmed 2026-09-06 via `npm view react-router-dom version` → `7.18.3`; `npm view react-router-dom dist-tags` → `{"latest":"7.18.3", ...}` (no v8 published under this name); `npm view react-router-dom peerDependencies` → `{"react":">=18","react-dom":">=18"}`; `npm view react-router-dom@7.18.3 dependencies` → `{"react-router":"7.18.3"}` (pinned exact — confirms it's a thin compat wrapper). Cross-checked against installed `react@19.1.1` in `pnpm-lock.yaml` / `apps/client/node_modules/react/package.json`. Separately, `npm view react-router dist-tags` → `{"latest":"8.3.1", ...}` and `npm view react-router@8.3.1 peerDependencies` → `{"react":">=19.2.7","react-dom":">=19.2.7"}` — this is the incompatible package NOT to install.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `react-router-dom` | npm | latest version (`7.18.3`) published 2026-08-28; package itself is a long-established, multi-year library (v1 dist-tag history back to `3.2.6`/`5.3.4`) | 43,463,329/week | `github.com/remix-run/react-router` | **SUS** (automated signal: "too-new" — triggered by the *version's* publish date, not package age) | **Kept, flagged.** See note below. |

**Note on the SUS verdict:** The automated legitimacy gate flags `react-router-dom` as `SUS` solely because its most recent version (`7.18.3`) was published within the gate's "too-new" lookback window. This is a false-positive-shaped signal for an unusually well-established package: 43M weekly downloads, official `remix-run` GitHub org, no deprecation notice, no postinstall script, and the package name itself matches the user's locked decision in `STATE.md` (not a name I'm proposing). Per protocol, the verdict is honored as-is — **the planner must still insert a `checkpoint:human-verify` task before the `npm install` step**, even though the underlying signals (downloads, repo, no postinstall) are unambiguous. `npm view react-router-dom scripts.postinstall` returned empty (no postinstall script).

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `react-router-dom` — planner must add `checkpoint:human-verify` before the install task, per protocol, despite the strong legitimacy signals documented above.

## Architecture Patterns

### System Architecture Diagram

```
Browser (SPA)
│
├─ main.tsx
│   └─ <BrowserRouter>                     ← NEW: wraps everything, outermost
│        └─ <Authenticator>                ← existing, unchanged internally
│             └─ AppContent (userEmail, onSignOut)
│                  └─ <Routes>             ← NEW
│                       ├─ <Route path="/" element={<TripListPage/>} />
│                       └─ <Route path="/trips/:tripId" element={<TripDetailPage/>} />
│
TripListPage (existing AppContent body, minus routing glue)
│  useEffect → getTrips() ──────────────────────► GET /api/trips
│  <TripList trips={trips}>
│      each row wrapped in <Link to={`/trips/${tripId}`}>  ← NEW navigation
│
TripDetailPage (NEW component)
│  useParams() → { tripId }
│  useEffect → getTripDetail(tripId) ───────────► GET /api/trips/:tripId
│      200 → render <ItemTable trip={data}/>
│      404 → render "Trip not found." + <Link to="/">Back to my trips</Link>
│
ItemTable (NEW component)
│  "+ Add item" click
│      └─ createItem(tripId, {defaults}) ───────► POST /api/trips/:tripId/items
│           response (real itemId) → append row to local state
│  per-cell onBlur/onChange
│      └─ optimistic setState(field)
│      └─ patchItem(tripId, itemId, {field}) ───► PATCH /api/trips/:tripId/items/:itemId
│           200 → reconcile with server-returned Item
│           409 → roll back field, show conflict banner + "Refresh" button
│           4xx (other) → roll back field, show "Failed to save changes."
│  delete click
│      └─ confirm() dialog
│      └─ deleteItem(tripId, itemId) ───────────► DELETE /api/trips/:tripId/items/:itemId
│           200 → remove row from local state
│           400 (packed item) → pre-empted client-side (disabled control, D-09)
```

### Recommended Project Structure
```
apps/client/src/
├── App.tsx                # add <Routes>/<Route> (or BrowserRouter, see below)
├── main.tsx                # alternative location for <BrowserRouter> (either works; pick one)
├── TripList.tsx            # existing — add <Link to={`/trips/${tripId}`}> per row
├── TripDetail.tsx           # NEW — page component, useParams + fetch + 404/loading states
├── ItemTable.tsx             # NEW — the inline-edit table itself
├── api/
│   └── api.ts               # extend: getTripDetail, createItem, patchItem, deleteItem
```
(File names/split are the planner's call per the "one component per file" convention already in `.planning/codebase/STRUCTURE.md`; `TripDetail.tsx` + `ItemTable.tsx` is one reasonable split, a single `TripDetail.tsx` containing both is equally valid given the table has no reuse elsewhere.)

### Pattern 1: Declarative routing, router wraps Authenticator
**What:** `<BrowserRouter>` is the single outermost wrapper; `<Authenticator>` and its children sit entirely inside it.
**When to use:** Always, for this app — there is exactly one route tree and no server-rendering boundary to worry about.
**Example:**
```tsx
// Source: react-router-dom v7 Declarative Mode (reactrouter.com/start/modes) — general shape;
// package/version facts verified via npm registry this session.
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

// inside App.tsx, AppContent's returned JSX becomes:
<Routes>
  <Route path="/" element={<TripListPage userEmail={userEmail} />} />
  <Route path="/trips/:tripId" element={<TripDetail />} />
</Routes>
```

### Pattern 2: Reading the route param
```tsx
// Source: react-router-dom v7 Declarative Mode API
import { useParams } from 'react-router-dom';

function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>();
  // tripId is `string | undefined` per react-router-dom's types — guard before fetch
}
```

### Pattern 3: Navigation from TripList
```tsx
// Whole-row-click navigation, locked by 08-UI-SPEC.md "navigation" row.
import { Link } from 'react-router-dom';

<Link to={`/trips/${trip.tripId}`} className="trip-item" key={trip.tripId}>
  {/* existing trip-item-main / trip-participants markup, unchanged */}
</Link>
```
Note: the existing markup uses `<li className="trip-item">` inside a `<ul>`. `<Link>` renders an `<a>`, which is not valid direct table/list-item markup in every configuration — the planner should decide whether `<Link>` becomes the `<li>`'s child wrapping all content, or replaces the `<li>` tag itself (React Router does not require `<Link>` to be the outermost element; either is valid HTML, but only one preserves the existing `.trip-item` CSS class target without duplicating it on both `<li>` and `<a>`).

### Pattern 4: Add-row via immediate POST (not client-side optimistic stub)
**What:** Because `CreateItemRequest.name` is typed as a required `string` with no server-side default and no meaningful client default, "+ Add item" should fire `POST /trips/:tripId/items` immediately on click using the locked defaults (`packedBy` = current user, `status` unset, `name: ''`), then render the row using the **server-returned** `Item` (with its real `itemId`) — not a client-generated temporary ID.
**When to use:** For the create flow specifically. This is distinct from the edit flow (D-02's auto-save-per-field `PATCH`), which only applies once a row already has a real `itemId`.
**Why it matters:** D-07's blank-name guard blocks the *edit* path's `PATCH` calls, but does not (and per the phase's own reasoning, cannot) block the initial creation, since `POST`'s only path to existing is being called with *some* body. Confirmed: the server does not reject an empty `name` on `CreateItemRequest` — `[VERIFIED: apps/api/src/routes/api.ts:314-326]` — `buildCreateItemAttributes` returns `attrsResult.ok: false` only from its own business-rule checks (e.g. invalid `packedBy`, not from empty `name`), and 08-CONTEXT.md D-07 states explicitly: "The write API does not itself reject empty names, so this is a client-only guard." This means a newly-added row is briefly visible in the shared table with a blank, red-outlined Name cell until the current user (or another participant, since writes are shared) fills it in — this is expected behavior per D-07, not a bug, and the planner should not add server round-trip logic to prevent it.
```typescript
// Source: derived from 07-CONTEXT.md D-01 (packages/model/src/item.ts CreateItemRequest)
// and 08-CONTEXT.md D-07. Field values quoted verbatim from packages/model/src/item.ts:15-23.
async function handleAddItem() {
  const created = await createItem(tripId, {
    name: '',                 // required by CreateItemRequest; blank until user types
    packedBy: userEmail,      // ITEM-01 default
    // status omitted → unset (ITEM-01 default)
  });
  setItems((prev) => [...prev, created]); // created.itemId is server-issued, real
}
```

### Anti-Patterns to Avoid
- **Installing bare `react-router` instead of `react-router-dom`:** silently pulls a peer-dependency floor (`react >=19.2.7`) higher than this project's installed React (`19.1.1`) `[VERIFIED: npm registry]`. Always pin `react-router-dom`.
- **`createBrowserRouter`/Data Mode for this one route:** adds `loader`/`action` architecture with no phase requirement asking for it; the app's existing `useState`+`fetch` pattern already does what a loader would do.
- **Client-generated temporary IDs for new item rows:** unnecessary here — see Pattern 4. A temp-ID + reconcile scheme is the standard fix for *slow-server* optimistic creates, but this phase has no requirement demanding the new row appear before the `POST` resolves (unlike the *edit* flow, which explicitly is optimistic per D-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| URL-to-component matching, browser history | Custom `window.location`/`popstate` listener + component switch | `react-router-dom`'s `BrowserRouter`/`Routes`/`Route` | Handles history API edge cases (back/forward, base path, encoding) that a hand-rolled listener will eventually mis-handle |
| Route param extraction | Manual `window.location.pathname.split('/')` parsing | `useParams()` | Type-safe, matches the declared route pattern exactly, no manual index math |
| Delete confirmation dialog | Custom modal component | native `confirm()` (already locked by 08-UI-SPEC.md) | Explicitly decided against — codebase has zero existing modal primitives; disproportionate for one confirmation |

**Key insight:** This phase has almost no "don't hand-roll" surface beyond routing itself — the rest of the interaction model (optimistic state, per-field save) is intentionally hand-rolled per D-01–D-04's own reasoning (no state-management library was proposed or needed for one table's worth of local state).

## Common Pitfalls

### Pitfall 1: Installing the wrong router package
**What goes wrong:** Running `npm install react-router` (omitting `-dom`) instead of `react-router-dom`, because training data / search results increasingly reference the unified `react-router` package as "the" React Router package post-v7.
**Why it happens:** React Router v7 unified internals so that `react-router-dom` is now a thin re-export of `react-router`; v8 (current, `8.3.1`) went further and only ships DOM bindings from `react-router` (or its `/dom` subpath) — some current docs/tutorials reference `react-router` directly.
**How to avoid:** Pin `react-router-dom@^7.18.3` explicitly in `package.json`; never let a task substitute the bare package name. Verify with `npm view react-router-dom peerDependencies` before merging any dependency-bump PR.
**Warning signs:** `npm install`/`pnpm install` peer-dependency warnings mentioning a React version `>=19.2` when the project has `react@19.1.1`.

### Pitfall 2: Overlapping in-flight PATCH requests on rapid tab-through
**What goes wrong:** A user tabs quickly through several fields (D-04's native tab order); each blur fires its own `PATCH`. If responses arrive out of order, a later field's optimistic value could theoretically be overwritten by an earlier, slower response's stale reconciliation — though since each `PATCH` is field-scoped (Phase 7 D-01: "single PATCH handles a whole row" but request bodies here are per-field per D-02) and the server returns `ALL_NEW` attributes, a stale *response* only risks re-writing fields the client didn't just change locally.
**Why it happens:** No request cancellation (`AbortController`) or per-field request sequencing is in place by default with plain `fetch`.
**How to avoid:** When reconciling a `PATCH` response into state, merge only the field(s) that specific request was responsible for, not the entire returned `Item` wholesale — otherwise a slow response for field A can stomp a newer optimistic value for field B that arrived and was already reconciled by a faster, later request.
**Warning signs:** A field's displayed value "flickers back" to an older value after the user has already moved on and edited something else.

### Pitfall 3: 409-conflict retry looping
**What goes wrong:** Treating the 409 (`Item was modified concurrently — refresh and retry`) as a normal transient-error case and auto-retrying the same `PATCH` — this can loop indefinitely since the 409 is raised by a genuine invariant race (Phase 7 D-06/D-07), not a flaky network blip.
**Why it happens:** Generic fetch-wrapper retry logic (if the codebase had any — it currently doesn't) is often applied uniformly to all non-2xx responses.
**How to avoid:** 409 gets its own branch: roll back optimistic value, show the verbatim server message + "Refresh" button (already locked in `08-UI-SPEC.md`'s Copywriting Contract) that re-fetches `GET /trips/:tripId` — never a blind auto-retry, per `08-CONTEXT.md`'s "Claude's Discretion → Conflict handling" guidance.
**Warning signs:** Rapid repeated network calls to the same `PATCH` endpoint in the browser devtools Network tab.

### Pitfall 4: Native `confirm()` blocking-dialog interaction with optimistic state
**What goes wrong:** `window.confirm()` is a synchronous, blocking call — if any optimistic field update was already queued/in-flight when the delete button is clicked, the blocking dialog doesn't pause that request; it can resolve while the confirm dialog is still open, and if the user then confirms delete, a just-arrived `PATCH` response for a field on that same row could re-render right before the row is removed.
**Why it happens:** `confirm()` blocks the main thread's *rendering*, not pending `fetch` promises, which continue resolving in the background (they're not thread-blocked, just their callbacks queue behind the modal's event loop turn).
**How to avoid:** Low actual risk given the row is about to be deleted regardless — reconciling a field on a row that's about to disappear is harmless. No special handling needed; noted here only so the planner doesn't need to invent one.
**Warning signs:** None expected in practice; included for completeness given D-01–D-04 already accepted this tradeoff implicitly.

## Code Examples

### Trip-detail fetch + 404 handling
```typescript
// Source: pattern derived from apps/client/src/api/api.ts's existing getTrips/createTrip
// shape (this session, apps/client/src/api/api.ts:28-35) + 08-UI-SPEC.md Copywriting Contract.
export async function getTripDetail(tripId: string): Promise<TripDetailResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips/${tripId}`, { headers });
  if (response.status === 404) {
    throw new Error('Trip not found.'); // matches 08-UI-SPEC.md verbatim copy
  }
  if (!response.ok) {
    throw new Error('Failed to load trip.');
  }
  return response.json();
}
```

### Field patch with per-field reconciliation (Pitfall 2 mitigation)
```typescript
// Source: derived from apps/api/src/routes/api.ts:339-472 (PATCH handler contract)
// and 08-CONTEXT.md D-02/D-03. PatchItemRequest shape quoted verbatim from
// packages/model/src/item.ts:25-33.
export async function patchItem(
  tripId: string,
  itemId: string,
  patch: Partial<{
    name: string;
    quantity: number;
    weight: number | null;
    packedBy: string | null;
    status: 'to-buy' | 'found' | 'packed' | null;
    category: string | null;
    consumable: boolean;
  }>,
): Promise<Item> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${config.apiUrl}/api/trips/${tripId}/items/${itemId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  if (response.status === 409) {
    const body = await response.json();
    throw new ConflictError(body.error); // 'Item was modified concurrently — refresh and retry'
  }
  if (!response.ok) {
    throw new Error('Failed to save changes.');
  }
  return response.json();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `react-router-dom` as the primary/only import path | `react-router` (unified) with `react-router-dom` retained only as a v6-migration compat shim | react-router-dom v7 (unification), deepened in v8 (`8.0.0`, current `8.3.1`) which requires `react/react-dom >=19.2.7` | Does not change what this phase installs (`react-router-dom@^7.18.3` is still correct and current for this project's React version), but means future React-version-bump work should re-evaluate whether to migrate off `react-router-dom` onto bare `react-router` |

**Deprecated/outdated:** Nothing this phase depends on is deprecated. `react-router-dom` is not marked deprecated on npm (`npm view react-router-dom deprecated` returned empty) despite being feature-frozen at v7.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `<BrowserRouter>` should wrap `<Authenticator>` (not the reverse) | Architecture Patterns, Pattern 1 | Low — no evidence of an actual Amplify+react-router conflict either way; if wrong, only a one-line reordering during implementation, no data-model impact |
| A2 | `<Link>` can replace or wrap the existing `<li className="trip-item">` without breaking the CSS box model | Pattern 3 | Low-medium — could require a small CSS adjustment (`<a>` default display/margin differs from `<li>`); a quick visual check during implementation resolves it |

**If this table is empty:** N/A — two low-risk assumptions logged above; both resolvable by direct observation during implementation, neither blocks planning.

## Open Questions

1. **Exact split of `TripDetail.tsx` vs. `ItemTable.tsx`**
   - What we know: One component (page-level, fetch + 404/loading) and one presentational table are the natural seams; the codebase convention is one-component-per-file.
   - What's unclear: Whether the add-item form/button belongs inside `ItemTable` or as a sibling in `TripDetail`.
   - Recommendation: Planner's call — either is consistent with existing conventions; not worth gating on.

2. **Where exactly `<BrowserRouter>` is placed — `main.tsx` vs. inside `App.tsx`**
   - What we know: Functionally identical either way; the codebase's existing `main.tsx` is a thin Amplify-config-import + `ReactDOM.createRoot` shell.
   - What's unclear: No project convention establishes a preference.
   - Recommendation: `App.tsx` is the natural spot since it already contains the top-level `<Authenticator>` wrapper being wrapped — keeps routing setup colocated with the component that already owns the app shell.

## Environment Availability

No external service/tool dependencies beyond the npm package itself (no database, no new CLI, no Docker requirement introduced by this phase).

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `react-router-dom` (npm package) | `/trips/:tripId` routing | Not yet installed (confirmed absent from `apps/client/package.json`) | to be installed: `^7.18.3` | none needed — installable, no known blocker |
| Node/pnpm toolchain | build/dev | ✓ (existing monorepo, `pnpm@10.12.1`) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — `react-router-dom` is simply not yet installed; installing it is the task itself, not a blocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None detected in `apps/client`** — no `vitest`/`jest` config, no `*.test.*`/`*.spec.*` files found under `apps/client/src`. `apps/api` has ad hoc `*.test.ts` files (e.g. `apps/api/src/lib/tripDetail.test.ts`) but no client-side unit test runner exists at all `[VERIFIED: find over apps/client — zero matches for test/spec files or config]`. The monorepo does have `apps/e2e` (Playwright), but per this phase's own scope boundary ("no new E2E specs — Phase 10"), that suite is explicitly out of scope here. |
| Config file | none — see Wave 0 |
| Quick run command | none available for `apps/client` |
| Full suite command | `pnpm test` (root, via Turbo) currently only exercises `apps/api`'s test script; `apps/client`'s `package.json` has no `"test"` script at all, so Turbo's `test` task is effectively a no-op for this package |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| TRIP-01 | Navigate to `/trips/:tripId`, see loaded table | manual-only | — | ❌ no client test framework — see Wave 0 |
| ITEM-01 | Add item row, defaults applied | manual-only | — | ❌ Wave 0 |
| ITEM-02 | Inline-edit any field, persists | manual-only | — | ❌ Wave 0 |
| ITEM-03 | Delete row after confirmation | manual-only | — | ❌ Wave 0 |

**Justification for manual-only:** This phase ships zero automated client-side test infrastructure (none exists in the repo today), and the phase's own scope boundary explicitly defers "no new E2E specs (Phase 10)". Per `.planning/REQUIREMENTS.md`, E2E-01/E2E-02 (Playwright coverage of this exact happy path) are Phase 10's job. Standing up a client unit-test framework (vitest + testing-library) purely to cover four success criteria that Phase 10 will re-cover end-to-end would duplicate effort against the project's own roadmap sequencing. This phase's verification should rely on `/gsd-verify-work`'s conversational UAT against the four success criteria, consistent with how Phases 6/7 were verified (per `STATE.md`'s note that Phase 6's manual UAT is still pending closeout — a process gap to fix, not a reason to add scope here).

### Sampling Rate
- **Per task commit:** `pnpm --filter client type-check` and `pnpm --filter client lint` (the only automated gates available for this package)
- **Per wave merge:** `pnpm build` (root) — catches any TypeScript/bundling break across the whole monorepo
- **Phase gate:** Conversational UAT via `/gsd-verify-work` against the four success criteria (no automated full suite exists for this package)

### Wave 0 Gaps
- No client-side test framework exists (`vitest`/`@testing-library/react` not installed). Standing one up is explicitly **not** recommended for this phase (see justification above) — flagged here only so the planner does not silently assume test coverage exists.
- If the planner's risk tolerance differs from this recommendation, the minimal addition would be `vitest` + `@testing-library/react` + `jsdom`, but this is a scope decision for the planner/user, not a research-mandated gap.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No — unchanged this phase | Existing Cognito `Authenticator` + JWT flow (Phase 6/CLAUDE.md); this phase adds no new auth surface |
| V3 Session Management | No — unchanged this phase | Existing `fetchAuthSession()`/`getAuthHeaders()` pattern in `api/api.ts`, reused verbatim for the 4 new API functions |
| V4 Access Control | Yes (client must correctly *render*, not re-derive, the server's decision) | Server already enforces the 404-not-403 participation guard (Phase 6 D-02) — the client's only obligation is to treat any non-2xx trip-detail fetch as "Trip not found." and never attempt to distinguish member-vs-nonexistent client-side (per `08-UI-SPEC.md`'s locked copy) |
| V5 Input Validation | Yes (client-side UX guard only, not a security boundary) | D-07's blank-name guard is a UX nicety, not a security control — the server (Phase 7) is and remains the authoritative validator; the client must not be relied upon (or documented) as an access-control or data-integrity boundary |
| V6 Cryptography | No | No crypto surface in this phase — JWT verification is entirely server-side (`apps/api/src/plugins/auth.ts`, unchanged) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Trip/item ID enumeration via the URL bar (`/trips/:tripId`) | Information Disclosure | Already mitigated server-side — any `tripId` a non-member types into the URL gets the identical 404 response as a genuinely nonexistent trip (Phase 6 D-02, verified in `apps/api/src/routes/api.ts:250-261`: *"Participation guard (enumeration-resistant): a single branch serves both failure modes... Both yield an identical 404"*). This phase's client code must preserve that indistinguishability in its UI copy (already locked: identical "Trip not found." message for both cases) rather than, e.g., logging or displaying which case occurred. |
| Trusting client-supplied `packedBy`/identity in request bodies | Spoofing | Not applicable to this phase's new code — identity for `PackedBy` on new-row defaults comes from the already-verified `userEmail` prop (itself sourced from the JWT via `Authenticator`), and the server independently validates `packedBy` values against the real participant list (Phase 7 D-04) regardless of what the client sends |
| Optimistic UI masking a rejected write | Tampering (of displayed state, not data) | D-03 already requires rollback-on-failure; this phase's implementation must ensure the rollback actually restores the last known-good *server* value (not just "undo the keystroke"), so a user can't be shown a value that was never actually persisted |

## Sources

### Primary (HIGH confidence)
- `npm view react-router-dom` (version, dist-tags, peerDependencies, dependencies, deprecated, scripts.postinstall, readme) — run directly against the npm registry this session, 2026-09-06.
- `npm view react-router` (dist-tags, peerDependencies for 8.3.1) — same, 2026-09-06.
- `apps/api/src/routes/api.ts:230-473`, `apps/api/src/lib/tripDetail.ts:444-448`, `packages/model/src/item.ts:1-40` — read directly this session.
- `apps/client/package.json`, `apps/client/src/App.tsx`, `apps/client/src/TripList.tsx`, `apps/client/src/api/api.ts` — read directly this session.
- `pnpm-lock.yaml` (installed `react@19.1.1`) — read directly this session.

### Secondary (MEDIUM confidence)
- `reactrouter.com/start/modes` (fetched this session) — Declarative vs. Data vs. Framework mode comparison and API shape. Note: the fetched summary referenced "React Router v8" terminology for what is, per npm registry data, the current live documentation (the docs site has been updated to describe the v8-era package split) — cross-checked against registry data above, no contradiction found once package-split is accounted for.

### Tertiary (LOW confidence)
- WebSearch: "react controlled input auto-save on blur optimistic update focus loss re-render pitfalls" — general community pattern discussion, not React-19-specific, not this-codebase-specific. Used only to confirm no React-19-specific breaking change exists for this pattern.
- WebSearch: AWS Amplify UI Authenticator + react-router-dom wrap order — no definitive official example found combining both; general composition-pattern inference only (see Assumption A1).

## Metadata

**Confidence breakdown:**
- Standard stack (react-router-dom version/compatibility): HIGH — every claim verified directly against the npm registry this session, cross-checked against the actual installed React version in `pnpm-lock.yaml`.
- Architecture (routing mode choice, component structure): MEDIUM-HIGH — Declarative-vs-Data-mode recommendation is well-supported by official docs; exact file split and `BrowserRouter` placement are genuinely discretionary (flagged as Open Questions, not risks).
- Pitfalls (auto-save/optimistic-update): MEDIUM — general web-development pitfalls, not verified against a React-19-specific source; no codebase-specific test caught anything the CONTEXT.md decisions hadn't already anticipated.

**Research date:** 2026-09-06
**Valid until:** 30 days (stable npm packages; react-router's version-8 release cadence noted above is the one fast-moving element worth re-checking if this phase's execution slips significantly past that window)
