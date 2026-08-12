# Stack Research

**Domain:** Shared packing-table CRUD feature added to an existing React 19 + Vite SPA / Fastify 5 + DynamoDB app
**Researched:** 2026-08-11
**Confidence:** HIGH (grounded in the actual codebase, not third-party docs)

## Headline Finding

**This slice needs zero new npm dependencies.** Every capability the packing item table requires is already installed and in use:

- Client editing → plain controlled React inputs (React 19 already present)
- Client data-fetching/state → plain `fetch` + `useState`/`useReducer` (the existing `api.ts` pattern)
- Item CRUD persistence → `UpdateCommand` + `DeleteCommand`, which ship inside the already-installed `@aws-sdk/lib-dynamodb`
- Validation → manual checks matching the existing route style (or Fastify's built-in JSON Schema — also no new dep)
- Styling → Tailwind v4 (already present)

The work is **code, not stack**: new routes, new components, new shared model types, and two additional SDK command imports. Treat the "installation" step as "nothing to install."

## Recommended Stack

### Core Technologies (all already present — reuse, do not add)

| Technology | Version (installed) | Purpose in this slice | Why it's the right tool |
|------------|---------------------|-----------------------|-------------------------|
| React | ^19.1.1 | Trip detail page + editable item table | Fixed 7-column table with a handful of controlled inputs is trivial React; no grid lib needed |
| `@aws-sdk/lib-dynamodb` | ^3.962.0 | Item create/read/update/delete | Already the app's DynamoDB access layer; `UpdateCommand`/`DeleteCommand` live here — just add the imports |
| Fastify | ^5.5.0 | New protected item routes | Existing route module (`apps/api/src/routes/api.ts`) already hosts trip CRUD; add sibling item routes in the same protected scope |
| Tailwind CSS | ^4.2.1 | Table + control styling | Already wired via `@tailwindcss/vite`; no component library in play, keep it that way |
| `@packpixie/model` | workspace:* | Shared `Item`/request/response types | Existing shared-types pattern (`trip.ts`, `status.ts`); add `item.ts`, remove `comment.ts` |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | No supporting library is justified for this slice. See "What NOT to Use." |

New SDK command imports (from the **already-installed** `@aws-sdk/lib-dynamodb`, not new packages):

| Import | Command | Used for |
|--------|---------|----------|
| `UpdateCommand` | `UpdateItem` | Partial item edits; combined `SET`/`REMOVE` handles "clearing PackedBy resets Status" in one write |
| `DeleteCommand` | `DeleteItem` | Row deletion (`PK = TRIP#<id>`, `SK = ITEM#<id>`) |
| `QueryCommand` (already imported) | `Query` | Single-query snapshot: `PK = TRIP#<id>` returns META + participants + items together |
| `PutCommand` (already imported) | `PutItem` | Create a new item row (`SK = ITEM#<uuid>`) |

`randomUUID` (node `crypto`) is already used for IDs — reuse it for item IDs.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Playwright (`apps/e2e`) | Extend E2E to cover the item-table happy path | Already installed and green in CI; add a spec, no new tooling |
| Vitest / Jest | — | **Not** in scope — PROJECT.md scopes testing to E2E only; do not introduce a unit-test runner for this slice |

## Installation

```bash
# Core: nothing to install — all dependencies already present.

# Supporting: nothing.

# Dev dependencies: nothing.
```

The only "install-shaped" changes are import statements and a shared-types file:

```ts
// apps/api/src/routes/api.ts — extend the existing lib-dynamodb import
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,   // add
  DeleteCommand,   // add
  TransactWriteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
```

## Detailed Recommendations (per the research question)

### 1. React table / editing approach → plain controlled inputs, native `<table>`

Recommendation: a semantic `<table>` with one row per item; each cell is a **controlled** input — `<input type="text">` (Name), `<input type="number">` (Quantity, Weight g), `<select>` (PackedBy from participants, Status enum, Category), `<input type="checkbox">` (Consumable). Local list state lives in a `useReducer` (actions: `load`, `add`, `update`, `remove`, `replace`) so per-row edits are cheap and the "new row defaults PackedBy = me" rule is a one-liner in the `add` case.

Why not a table library: the table is fixed-schema, ~7 columns, and the milestone's filtering is **client-side and simple** (`PackedBy = me`, a status filter, show-all toggle). A grid lib (TanStack Table, AG Grid, MUI DataGrid) buys sorting/virtualization/column APIs the scope explicitly defers, at the cost of a large dependency and a styling system that clashes with the app's plain-Tailwind approach.

### 2. Client data-fetching / state → keep plain `fetch` + hooks

The existing `apps/client/src/api/api.ts` uses `fetch` with a shared `getAuthHeaders()` helper and returns typed JSON. Mirror it exactly. Add four functions:

- `getTrip(tripId)` → `GET /api/trips/:tripId` (snapshot: meta + participants + items)
- `createItem(tripId, input)` → `POST /api/trips/:tripId/items`
- `updateItem(tripId, itemId, patch)` → `PATCH /api/trips/:tripId/items/:itemId`
- `deleteItem(tripId, itemId)` → `DELETE /api/trips/:tripId/items/:itemId`

Component state: load the snapshot on enter into a `useReducer`, apply mutations to local state after each call resolves (MVP is last-write-wins per row — optimistic locking, `changes?since` polling, and cross-user edit confirmation are all deferred per PROJECT.md). Filtering is derived client-side with `useMemo` over the in-memory list — no refetch on filter change.

Why not React Query / SWR / Zustand / Redux: they earn their keep once you have server-cache invalidation, optimistic concurrency (409 handling), or polling sync — all explicitly out of scope this milestone. Adding them now imposes a state paradigm on a codebase that has deliberately stayed vanilla.

### 3. Form / validation → inline logic, no form library

The row rules are tiny and better expressed as plain functions enforced in **both** places:
- Client (UX): disable/repair `Status = packed` when `PackedBy` is empty; on clearing `PackedBy`, reset `Status`.
- Server (authoritative): reject `packed` without `PackedBy`; on `PackedBy` removal, `REMOVE` `Status` in the same `UpdateExpression`.

Match the existing route validation style (`if (!tripName?.trim()) return reply.status(400)...`). If you want schema-driven 400s, use **Fastify's built-in JSON Schema** validation (Ajv ships inside Fastify — no new dependency). Do not add react-hook-form, Formik, or zod for this slice.

### 4. DynamoDB commands → `UpdateCommand` + `DeleteCommand` from the existing SDK dep

- **Create**: `PutCommand` with `Item: { PK: 'TRIP#<id>', SK: 'ITEM#<uuid>', Name, Qty, Weight, PackedBy, Status, Category, Consumable }` (omit `PackedBy`/`Status` attributes when unset rather than storing null).
- **Read**: reuse the existing `QueryCommand` on `PK = TRIP#<id>`; split items (`SK` starts with `ITEM#`) from participants (`USER#`) and meta (`META#`) in code — exactly the pattern already used in `GET /trips`.
- **Update**: `UpdateCommand` with a composed `UpdateExpression` — `SET` changed fields, `REMOVE` cleared ones. This makes "clearing PackedBy resets Status" a single atomic write (`REMOVE PackedBy, #status`). Add a `ConditionExpression: attribute_exists(SK)` so updates to a deleted row fail cleanly.
- **Delete**: `DeleteCommand` keyed on `PK`/`SK`.
- **BatchWrite**: already imported and used for participants; **not needed** for single-row item CRUD.

Simplest alternative if `UpdateExpression` composition feels heavy for MVP: have the client send the whole row and use `PutCommand` to replace it (last-write-wins). Acceptable given concurrency is deferred, but `UpdateCommand` is only marginally more code and is the natural path toward the deferred optimistic-locking work — recommend `UpdateCommand`.

### 5. Routing / "enter a trip" page → no router; `useState` navigation

Recommendation for this slice: hold a `selectedTripId` in `App` (or lift into `AppContent`) and conditionally render `TripList` vs `TripDetail`. Zero dependencies, reload-safe enough for E2E (tests click from the list into the trip).

Why not react-router-dom now: the app has **no router today** and this milestone ships exactly one new view. A router earns its place when the deferred Packing/Distribution/Summary tabs and shareable trip URLs arrive. Add it then, as its own decision — not smuggled into this slice.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Plain `<table>` + controlled inputs | TanStack Table v8 | When you need column sorting, virtualization for long lists, or a reusable column API — none in scope now |
| `fetch` + `useReducer` | TanStack Query (React Query) v5 | When adding polling `changes?since` sync, optimistic updates, or 409-conflict retries (deferred) |
| Inline validation / Fastify JSON Schema | zod + `fastify-type-provider-zod` | When request/response schemas grow complex enough to want one source of truth shared client/server |
| `useState` view toggle | react-router-dom v7 | When shipping deep-linkable trip URLs or the Packing/Distribution/Summary tab set (deferred) |
| `UpdateCommand` (partial write) | `PutCommand` full-row replace | Absolute-minimum MVP where the client always holds and resends the whole row |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| TanStack Table / AG Grid / MUI DataGrid | Heavy dep + styling system for a fixed 7-column table with trivial client-side filters | Plain `<table>` + controlled inputs |
| React Query / SWR | Server-cache/optimistic-concurrency machinery for features deferred out of this milestone | `fetch` + `useReducer`/`useState` |
| Zustand / Redux / Jotai | Global-store paradigm the codebase has deliberately avoided; one trip's items fit in local component state | `useReducer` in the trip-detail component |
| react-hook-form / Formik | Full form-library weight for ~7 fields with two simple cross-field rules | Inline controlled inputs + small validation functions |
| zod / ajv / typebox (as a new dep) | New validation stack when Fastify already bundles Ajv and the existing routes validate manually | Manual checks or Fastify built-in JSON Schema |
| react-router-dom (this slice) | No router exists today; only one new view ships now | `useState` view toggle; revisit when tabs/shareable URLs land |
| DynamoDB ODM (OneTable, dynamodb-toolbox) | Abstraction over the single-table design the app already hand-rolls consistently | Direct `@aws-sdk/lib-dynamodb` commands |
| A unit-test runner (Vitest/Jest) | PROJECT.md scopes testing to E2E only | Extend the existing Playwright suite in `apps/e2e` |

## Stack Patterns by Variant

**If concurrency/conflicts become visible during the slice (two users editing same trip in E2E):**
- Still stay last-write-wins for MVP; add a `version` attribute + `ConditionExpression` only when the deferred optimistic-locking requirement is picked up.
- Because the app-architecture doc already specifies this path (409 + latest row), it's a clean later add — do not pre-build it now.

**If the item list ever needs server-side filtering or grows large:**
- Keep the single-query snapshot; filtering stays client-side per `dynamoDB-architecture.md` ("client does the heavy lifting"). No new indexes for this milestone.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@aws-sdk/lib-dynamodb@^3.962` | `@aws-sdk/client-dynamodb@^3.962` | Already aligned in `apps/api`; `UpdateCommand`/`DeleteCommand` are exported from lib-dynamodb — no version bump needed |
| React 19.1 | Vite 7.1 + `@vitejs/plugin-react` 5 | Existing, working; controlled inputs need nothing new |
| Fastify 5.5 | bundled Ajv | JSON Schema validation available without adding Ajv explicitly |

## Cleanup Required by This Slice (per repo convention "leave nothing unused")

Removing the Comments scaffold touches the stack surface — plan it as part of the change:
- Delete `/api/comments` GET/POST routes in `apps/api/src/routes/api.ts`
- Delete `apps/client/src/Comments.tsx` and its use in `App.tsx`
- Delete `getComments`/`postComment` from `apps/client/src/api/api.ts`
- Delete `packages/model/src/comment.ts` and its export in `index.ts`

## Sources

- `apps/client/src/api/api.ts`, `apps/client/src/App.tsx` — existing fetch + `useState` pattern, no router, no data-fetching lib — HIGH
- `apps/api/src/routes/api.ts` — existing `@aws-sdk/lib-dynamodb` usage (Query/Put/TransactWrite/BatchWrite), manual validation style, protected-scope routing — HIGH
- `apps/api/package.json`, `apps/client/package.json` — installed versions; confirms UpdateCommand/DeleteCommand source is already a dependency — HIGH
- `dynamoDB-architecture.md`, `app-architecture.md` — single-table access patterns, snapshot query, deferred concurrency/sync model — HIGH
- `app-description.md`, `.planning/PROJECT.md` — feature scope, item fields, cross-field rules, E2E-only testing scope — HIGH

---
*Stack research for: packing item-table CRUD on an existing React 19 + Fastify 5 + DynamoDB app*
*Researched: 2026-08-11*
