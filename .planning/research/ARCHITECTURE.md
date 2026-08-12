# Architecture Research

**Domain:** Collaborative trip-packing SPA — integrating a shared packing-table feature into an existing Fastify + DynamoDB + React monorepo
**Researched:** 2026-08-11
**Confidence:** HIGH (all findings grounded in the current source: `apps/api/src/routes/api.ts`, `apps/api/src/plugins/auth.ts`, `packages/model/src/*`, `apps/client/src/*`, `dynamoDB-architecture.md`)

This is **subsequent-milestone integration research**, not a greenfield design. The stack, single-table schema, auth flow, and DTO conventions already exist and must be reused as-is. The Item entity is already specified in `dynamoDB-architecture.md` (SK `ITEM#<ItemId>`, single-query trip load, `UpdateItem` for mutations) — this milestone implements that design for the non-deferred subset of fields.

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT  (apps/client — React 19 + Vite SPA)                      │
│  ┌────────────┐   ┌──────────────────┐   ┌───────────────────┐    │
│  │ TripList   │──▶│ TripDetailPage   │──▶│ ItemTable /       │    │
│  │ (exists)   │   │ (NEW - route)    │   │ ItemRow (NEW)     │    │
│  └────────────┘   └────────┬─────────┘   └─────────┬─────────┘    │
│                            │  api/api.ts (fetch + Bearer JWT)     │
├────────────────────────────┼─────────────────────────────────────┤
│  API  (apps/api — Fastify 5, Lambda in prod / HTTP local)        │
│  routes/api.ts  ┌───────────────────────────────────────────┐    │
│    public   ─── │ /hello  /status                           │    │
│    protected ── │ authPlugin → request.user (verified JWT)   │    │
│                 │  /trips  /trips/:id  /trips/:id/items ...  │    │
│                 └──────────────────┬────────────────────────┘    │
│                     assertParticipant() authZ guard (NEW)         │
├────────────────────────────────────┼────────────────────────────┤
│  DATA  (DynamoDB single-table "PackPixie", on-demand)            │
│   PK = TRIP#<id>                                                  │
│     SK META#<id>   (trip meta)                                    │
│     SK USER#<email>(participant, GSI1 for by-user listing)       │
│     SK ITEM#<id>   (item rows — NEW writes this milestone)       │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New / Modified |
|-----------|----------------|----------------|
| `packages/model/src/item.ts` | Shared `Item`, `ItemStatus`, request/response DTOs | **NEW file** |
| `packages/model/src/trip.ts` | Add `TripDetailResponse` (meta + participants + items) | Modified |
| `apps/api/src/routes/api.ts` | New item routes + single-query trip-detail load; `assertParticipant` guard | Modified |
| `apps/client/src/api/api.ts` | `getTripDetail`, `createItem`, `updateItem`, `deleteItem`; drop comment fns | Modified |
| `apps/client/src/TripDetailPage.tsx` | Fetch snapshot, own item state, render table + filters | **NEW** |
| `apps/client/src/ItemTable.tsx` / `ItemRow.tsx` / `AddItemRow.tsx` | Item CRUD UI | **NEW** |
| Router (App.tsx) | Route `/` (list) and `/trips/:tripId` (detail) | Modified |

## Recommended Project Structure

```
packages/model/src/
├── item.ts              # NEW — Item, ItemStatus, ItemCategory, Create/UpdateItemRequest, ItemResponse
├── trip.ts              # +TripDetailResponse
└── index.ts             # + export * from './item.js'

apps/api/src/
├── routes/api.ts        # + item routes (POST/PATCH/DELETE) + GET /trips/:tripId
├── lib/authz.ts         # NEW (optional) — assertParticipant(client, table, tripId, email)
└── plugins/auth.ts      # unchanged (request.user is the identity source of truth)

apps/client/src/
├── App.tsx              # + <BrowserRouter> / routes
├── TripList.tsx         # trip name becomes a <Link to={`/trips/${tripId}`}>
├── TripDetailPage.tsx   # NEW — snapshot load, filter state, orchestrates table
├── ItemTable.tsx        # NEW — renders rows + column headers + filter bar
├── ItemRow.tsx          # NEW — one editable row
├── AddItemRow.tsx       # NEW — new-row form (PackedBy defaults to me)
└── api/api.ts           # + item calls, − comment calls

apps/e2e/tests/
└── items.spec.ts        # NEW — item table happy path
```

### Structure Rationale

- **`packages/model` first, always.** Both `apps/api` and `apps/client` import `@packpixie/model`. Every route handler and fetch wrapper is typed against these DTOs, so the types are the contract that unblocks the other two packages.
- **`lib/authz.ts` as a small helper, not a plugin.** The membership check is per-trip (needs `tripId` from params), so it cannot be a one-time `onRequest` decorator like `authPlugin`. A plain async function called at the top of each item handler is the least-magic fit for the existing route style.
- **One page component owning the snapshot.** `dynamoDB-architecture.md` explicitly hands the flat query array to the frontend to split client-side. `TripDetailPage` is the natural owner of that normalized state, mirroring how `AppContent` owns `trips`.

## Architectural Patterns

### Pattern 1: Single-query trip-detail load (snapshot), split client-side

**What:** `GET /trips/:tripId` runs one `QueryCommand` on `PK = TRIP#<tripId>` and returns the whole partition. The handler partitions items by SK prefix into `trip` (META), `participants` (USER), and `items` (ITEM).
**When:** Every time a trip is opened. This is the "everyday operation" in `dynamoDB-architecture.md` §4A.
**Trade-offs:** One round-trip, no N+1 (contrast the existing `GET /trips` which fires a participants query per trip). All trip data is co-located in one partition, so it stays a single fast query even as items grow.

```typescript
// apps/api/src/routes/api.ts (inside protected scope)
protected_.get<{ Params: { tripId: string } }>(
  '/trips/:tripId',
  async (request, reply): Promise<TripDetailResponse> => {
    const { tripId } = request.params;
    const email = request.user.email.trim().toLowerCase();

    const { Items = [] } = await dynamoDBClient.send(new QueryCommand({
      TableName: conf.dynamoDBTable,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `TRIP#${tripId}` },
    }));

    // AuthZ: caller must be a participant of THIS trip (see Pattern 3)
    const isMember = Items.some(
      (i) => (i.SK as string) === `USER#${email}`,
    );
    if (!isMember) return reply.status(404).send({ error: 'Trip not found' }) as never;

    const meta = Items.find((i) => (i.SK as string).startsWith('META#'));
    const participants = Items
      .filter((i) => (i.SK as string).startsWith('USER#'))
      .map((i) => i.Email as string);
    const items = Items
      .filter((i) => (i.SK as string).startsWith('ITEM#'))
      .map(toItemResponse); // maps DynamoDB attrs → Item DTO

    return { tripId, tripName: meta?.TripName as string, participants, items };
  },
);
```

### Pattern 2: Targeted mutations — Put (create), Update (edit), Delete

**What:** Item writes are keyed by `PK = TRIP#<tripId>`, `SK = ITEM#<itemId>`, matching `dynamoDB-architecture.md` §5.
- **Create** → `PutCommand` with a fresh `randomUUID()` itemId (same UUID pattern as trip create).
- **Edit** → `UpdateCommand` with a dynamically-built `SET`/`REMOVE` expression from the partial request body. **Requires importing `UpdateCommand` from `@aws-sdk/lib-dynamodb`** (not currently imported).
- **Delete** → `DeleteCommand` (also a new import).

**When:** Each row-level user action. Editing uses `UpdateItem` (not full `Put`) so concurrent edits to different fields on the same row don't clobber each other.
**Trade-offs:** MVP uses **last-write-wins** (no `version`/optimistic locking). `app-architecture.md` §5.3 describes a `version` + `ConditionExpression` scheme, but the milestone explicitly defers "cross-user edit confirmation." Recommend adding an (unused-for-now) `version`/`updatedAt` on writes so locking can be layered on later without a data migration — see Pitfalls.

```typescript
// Update: build SET/REMOVE from a whitelist of editable fields
const sets: string[] = [];
const removes: string[] = [];
const names: Record<string, string> = {};
const values: Record<string, unknown> = {};
for (const [field, attr] of EDITABLE) {          // e.g. ['name','Name'], ['status','Status']
  if (!(field in body)) continue;
  const v = (body as Record<string, unknown>)[field];
  names[`#${attr}`] = attr;
  if (v === null || v === undefined) { removes.push(`#${attr}`); }
  else { sets.push(`#${attr} = :${attr}`); values[`:${attr}`] = v; }
}
const UpdateExpression = [
  sets.length ? `SET ${sets.join(', ')}` : '',
  removes.length ? `REMOVE ${removes.join(', ')}` : '',
].filter(Boolean).join(' ');

await dynamoDBClient.send(new UpdateCommand({
  TableName: conf.dynamoDBTable,
  Key: { PK: `TRIP#${tripId}`, SK: `ITEM#${itemId}` },
  UpdateExpression,
  ExpressionAttributeNames: names,
  ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
  ConditionExpression: 'attribute_exists(SK)', // row must already exist
}));
```

### Pattern 3: Participant-scoped authorization on every trip-scoped request

**What:** Identity comes only from `request.user.email` (verified JWT — CLAUDE.md convention). Before any read or mutation on `TRIP#<tripId>`, confirm a `USER#<email>` participant record exists under that partition.
**When:** All four new routes (`GET /trips/:tripId`, `POST/PATCH/DELETE .../items/...`).
**Trade-offs:** Two clean options; pick per route:
- **Read/create-load path (GET detail):** you already Query the whole partition — check membership from the returned items (Pattern 1). Zero extra reads.
- **Blind mutations (PATCH/DELETE, and POST where you don't Query first):** do one cheap `GetCommand` on `PK=TRIP#<id>, SK=USER#<email>` and 403/404 if absent. Factor into `assertParticipant(client, table, tripId, email)` in `lib/authz.ts` and call it first in each handler.

Return **404 (not 403)** for non-members so the API doesn't leak the existence of trips the caller can't see. Never trust a `tripId` or email from the body/params as an authorization input — only `request.user`.

```typescript
// apps/api/src/lib/authz.ts
export async function assertParticipant(client, table, tripId, email) {
  const { Item } = await client.send(new GetCommand({
    TableName: table,
    Key: { PK: `TRIP#${tripId}`, SK: `USER#${email.trim().toLowerCase()}` },
    ProjectionExpression: 'SK',
  }));
  return Boolean(Item); // caller turns false → 404
}
```

### Pattern 4: Server-enforced correctness rules (cheap invariants)

**What:** The two "cheap correctness rules" for this slice live in the API handler, not only the UI:
- **`packed` requires `PackedBy`** — reject a PATCH that sets `Status='packed'` when the row would have no `PackedBy` (`app-description.md` §16.4). Compute against the merged post-update state.
- **Clearing `PackedBy` resets `Status`** — when a PATCH sets `PackedBy` to null/empty, also `REMOVE` `Status` in the same UpdateExpression (`app-description.md` §16.3, scoped to non-deferred fields — `UsedBy`/`Carried` resets are out of scope this slice).

**When:** In the PATCH handler, after building the field diff, before sending `UpdateCommand`.
**Trade-offs:** Enforcing server-side keeps invariants true regardless of client bugs or the E2E test path; the UI should still enforce them for UX, but the server is the source of truth.

## Data Flow

### Request Flow (open trip → edit a row)

```
Click trip name (TripList <Link>)
    ↓  react-router navigate /trips/:tripId
TripDetailPage mount → getTripDetail(tripId)
    ↓
GET /api/trips/:tripId → authPlugin (JWT) → QueryCommand PK=TRIP#<id>
    ↓  partition by SK prefix (META / USER / ITEM) + membership check
{ tripId, tripName, participants, items }  →  normalized into React state
    ↓  user edits Status on a row
updateItem(tripId, itemId, { status }) → PATCH /api/trips/:tripId/items/:itemId
    ↓  assertParticipant → invariant checks → UpdateCommand SET Status
200 → client refetches getTripDetail (MVP) OR patches local row (optimistic, optional)
```

### State Management

```
TripDetailPage (owns snapshot)
  ├─ items: Item[]            (source of truth from GET)
  ├─ filter: { packedBy: 'me' | 'all', status?: ItemStatus }   (default packedBy='me')
  └─ derived: visibleItems = items.filter(byPackedBy).filter(byStatus)
         ↓ props
   ItemTable → ItemRow(onEdit) / AddItemRow(onCreate)
         ↓ callbacks invoke api/api.ts, then re-fetch or update items[]
```

Filtering (`PackedBy = me`, status, show-all toggle) is **pure client-side** over the already-loaded snapshot — `dynamoDB-architecture.md` §4A is explicit that the client toggles filters "without ever hitting the database again." No filter query params on the API.

### Key Data Flows

1. **Snapshot load:** one Query → three typed arrays → normalized store. Same shape reused after every mutation if using refetch strategy.
2. **New row defaults:** `AddItemRow` seeds `PackedBy = current user email` before POST, so the row appears immediately in the default `PackedBy = me` view (`app-description.md` §10.6).

## Model Types to Add — and the deferred-field decision

**Decision: EXCLUDE `UsedBy` and `Carried` from the typed DTOs now; add them in the milestone that ships usage/distribution.**

Rationale (this is the explicit schema-now-vs-later call the quality gate asks for):
- DynamoDB is schemaless — no table migration is ever needed to add `UsedBy` (`SS`) or `Carried` (`M`) attributes later. There is **zero data-layer cost** to deferring them.
- Including them in the TS `Item`/DTOs now would be dead surface area: unread, unwritten, untested, and easy to half-wire incorrectly (e.g. String Set marshalling, which the current code has never exercised). Leaving nothing unused behind is a stated project convention (CLAUDE.md).
- The `dynamoDB-architecture.md` entity table still documents them, so the future intent is preserved without polluting the typed contract.
- **Forward-compat hook:** `toItemResponse` should map only the known fields and ignore unknown attributes, so pre-existing `UsedBy`/`Carried` on an item (e.g. from a future copy-trip) never break the reader.

```typescript
// packages/model/src/item.ts  (NEW)
export type ItemStatus = 'to-buy' | 'found' | 'packed';

export interface Item {
  itemId: string;
  name: string;
  qty: number;
  weight: number;          // grams, per unit
  packedBy: string | null; // participant email, or null if unassigned
  status: ItemStatus | null;
  category: string | null;
  consumable: boolean;
  // UsedBy / Carried intentionally deferred (see ARCHITECTURE.md)
}

export interface CreateItemRequest {
  name: string;
  qty?: number;            // default 1
  weight?: number;         // default 0
  packedBy?: string | null;// client sends current user by default
  status?: ItemStatus | null;
  category?: string | null;
  consumable?: boolean;    // default false
}

// Partial edit — only present fields are changed; null clears the attribute.
export type UpdateItemRequest = Partial<CreateItemRequest>;

export interface CreateItemResponse { item: Item; }
export interface UpdateItemResponse { item: Item; }
```

```typescript
// packages/model/src/trip.ts  (ADD)
import type { Item } from './item.js';
export interface TripDetailResponse {
  tripId: string;
  tripName: string;
  participants: string[];
  items: Item[];
}
```

Also: `packages/model/src/index.ts` gets `export * from './item.js';`. **Removal:** delete `packages/model/src/comment.ts` and its `index.ts` export, and drop the `/comments` routes + `Comments.tsx` + comment fns in `api/api.ts` as part of this milestone (Comments-scaffold removal is a stated requirement; "leave nothing unused behind").

## New API Routes — mapping to DynamoDB

| Route | Scope | SDK command | Key / Index | AuthZ |
|-------|-------|-------------|-------------|-------|
| `GET /trips/:tripId` | protected | `QueryCommand` | `PK = TRIP#<id>` | membership from query result → 404 if absent |
| `POST /trips/:tripId/items` | protected | `PutCommand` | `PK=TRIP#<id>, SK=ITEM#<uuid>` | `assertParticipant` first |
| `PATCH /trips/:tripId/items/:itemId` | protected | `UpdateCommand`* | `PK=TRIP#<id>, SK=ITEM#<itemId>` + `attribute_exists(SK)` | `assertParticipant` first |
| `DELETE /trips/:tripId/items/:itemId` | protected | `DeleteCommand`* | `PK=TRIP#<id>, SK=ITEM#<itemId>` | `assertParticipant` first |

*`UpdateCommand`, `DeleteCommand`, and `GetCommand` must be **added to the import** from `@aws-sdk/lib-dynamodb` in `apps/api/src/routes/api.ts` (currently only `QueryCommand`, `PutCommand`, `TransactWriteCommand`, `BatchWriteCommand` are imported).

All four slot inside the **existing `protected_` sub-scope** (`api.ts` line ~96, after `await protected_.register(authPlugin(conf))`), alongside `POST/GET /trips`. No new plugin registration is required — `authPlugin` already decorates `request.user` for the whole scope.

## Client Components / Data Flow

**Routing (new dependency decision):** the app currently renders everything in `AppContent` with no router. To make trip pages URL-addressable (`/trips/:tripId`) — which also lets E2E deep-link and reload — add **`react-router-dom`**. Wrap the app in `<BrowserRouter>`, route `/` → existing list, `/trips/:tripId` → `TripDetailPage`. Keep it inside `<Authenticator>` so auth still gates everything. Lightweight alternative (view-state in `useState`) is possible but loses URL addressability and complicates E2E; router is the recommended call.

- **`TripList.tsx` (modify):** wrap each `trip-name` in `<Link to={/trips/${trip.tripId}}>`. Keep the `data-testid="trip-name"` for existing tests.
- **`TripDetailPage.tsx` (new):** reads `tripId` from route params; on mount calls `getTripDetail`; owns `items`, `filter` (default `{ packedBy: 'me' }`), and `showAll` toggle; renders `ItemTable` + `AddItemRow`; re-fetches after each mutation (MVP-simple, matches `TripList`'s create→refetch pattern). Optimistic update is a nice-to-have, not required.
- **`ItemTable.tsx` / `ItemRow.tsx` (new):** columns Name, Qty, Weight, PackedBy, Status, Category, Consumable. Inline edits call `updateItem`; delete calls `deleteItem`. Enforce the packed/PackedBy rule in the UI for immediate feedback (server re-checks).
- **`AddItemRow.tsx` (new):** seeds `packedBy` with the current user's email so the row lands in the default view.
- **`api/api.ts` (modify):** add `getTripDetail(tripId)`, `createItem(tripId, body)`, `updateItem(tripId, itemId, body)`, `deleteItem(tripId, itemId)` — all reusing `getAuthHeaders()`; remove `getComments`/`postComment`.

## Suggested Build Order (dependency-respecting)

```
1. packages/model      Item + DTOs + TripDetailResponse; delete comment.ts; fix index.ts
      ↓ (types compile — contract for both sides)
2. apps/api            add imports (Update/Delete/Get); lib/authz.ts; 4 routes;
                       invariant checks; remove /comments routes
      ↓ (API testable via curl / e2e request)
3. apps/client         react-router; TripList links; TripDetailPage + ItemTable/Row/AddItemRow;
                       api/api.ts item calls; remove Comments.tsx + its imports in App.tsx
      ↓ (feature usable end-to-end)
4. apps/e2e            items.spec.ts happy path (open trip → add → edit status → delete);
                       remove any comment coverage
```

**Why this order:** `@packpixie/model` is a build-time dependency of both `apps/api` and `apps/client`, so the types must exist first or nothing else type-checks (`pnpm type-check` runs across all packages). API before client because the client's fetch wrappers and E2E assertions are written against real endpoints. E2E last because it exercises the full running stack. The Comments-scaffold removal threads through steps 1–3 (model, api, client) rather than being a separate phase — removing it alongside the additions keeps "nothing unused behind" in one pass.

**Parallelization note for the roadmapper:** steps 2 and 3 can overlap once step 1's types are merged, but the E2E step is a hard sequential tail.

## Scaling Considerations

| Scale | Adjustments |
|-------|-------------|
| 0–1k users | Current design is correct as-is. One Query per trip open; items co-located in the trip partition. |
| 1k–100k users | Still fine — access is always by `PK=TRIP#<id>`, naturally sharded per trip. Watch the 400 KB item-collection... actually the 400 KB limit is per *item*, not partition; a trip with thousands of item rows is still a single fast Query. |
| 100k+ users | Add the polling change-feed (`GET /trips/:id/changes?since=`) and optimistic-locking `version` from `app-architecture.md` §6–7 for live multi-user sync. Deferred well beyond this milestone. |

### Scaling Priorities

1. **First real bottleneck is collaboration freshness, not throughput.** Two users editing the same trip won't see each other's changes without polling/refetch. Deferred by the milestone; refetch-on-mutation is adequate for the single-active-editor common case.
2. **Concurrent edits to the same row** → last-write-wins today. The forward-compat `version` field makes adding `ConditionExpression` locking a non-migration change later.

## Anti-Patterns

### Anti-Pattern 1: Trusting `tripId`/email from params or body for authorization
**What people do:** Treat a `tripId` in the URL as proof the caller may touch that trip, or read a `packedBy` email from the body as the actor.
**Why it's wrong:** Any authenticated user could then read/edit any trip by guessing IDs. Violates the CLAUDE.md convention that identity comes only from verified JWT claims.
**Do this instead:** Always resolve the actor from `request.user.email`; gate every trip-scoped route with the `USER#<email>` membership check (Pattern 3); return 404 for non-members.

### Anti-Pattern 2: Full-item `PutCommand` on edit
**What people do:** Re-`Put` the whole item on every field change.
**Why it's wrong:** Clobbers concurrent field edits and would overwrite/erase the deferred `UsedBy`/`Carried` attributes that may already exist on a row.
**Do this instead:** `UpdateCommand` with a targeted `SET`/`REMOVE` over only the changed, whitelisted fields (Pattern 2).

### Anti-Pattern 3: Adding deferred fields to the typed contract "to be safe"
**What people do:** Put `usedBy`/`carried` into the `Item` DTO now because the schema doc lists them.
**Why it's wrong:** Creates unused, untested surface (String-Set marshalling in particular) and contradicts "leave nothing unused behind." DynamoDB needs no migration to add them later.
**Do this instead:** Keep DTOs to the seven active fields; make the item reader ignore unknown attributes so future data is forward-compatible.

### Anti-Pattern 4: Server-side filtering of the packing view
**What people do:** Add `?packedBy=me&status=...` query params and filter in DynamoDB.
**Why it's wrong:** Defeats the single-snapshot design; every filter toggle becomes a round-trip. `dynamoDB-architecture.md` §4A prescribes client-side filtering over the loaded array.
**Do this instead:** Load once, filter/toggle in React state.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| client ↔ api | `fetch` + `Authorization: Bearer <idToken>` via `getAuthHeaders()` | Reuse existing wrapper; add item fns beside `createTrip`/`getTrips` |
| api ↔ model | compile-time import `@packpixie/model` | Types are the contract; build model first |
| client ↔ model | compile-time import | Same DTOs on both ends prevent drift |
| api ↔ DynamoDB | `DynamoDBDocumentClient` (`@aws-sdk/lib-dynamodb`) | Add `UpdateCommand`, `DeleteCommand`, `GetCommand` imports |
| api routes ↔ ESM | `.js` extensions on relative imports (`../config.js`, `../lib/authz.js`) | CLAUDE.md convention — required at runtime |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Cognito | `authPlugin` verifies ID token → `request.user` | Unchanged; new routes inherit it by living in the protected scope |
| DynamoDB (Local in E2E) | testcontainers table per run; UI self-provisions | New `items.spec.ts` creates its own trip + items through the UI (no seeding) |

## Sources

- `apps/api/src/routes/api.ts` — existing route split, SDK usage, UUID + chunked-write patterns (HIGH, primary source)
- `apps/api/src/plugins/auth.ts` — `request.user` identity, protected-scope registration (HIGH)
- `dynamoDB-architecture.md` — Item entity, single-query load, `UpdateItem` mutation prescription (HIGH)
- `app-description.md` §10, §16 — packing table fields, new-row defaults, packed/PackedBy invariants (HIGH)
- `app-architecture.md` §5–8 — future version/change-feed design informing deferral decisions (HIGH)
- `packages/model/src/*`, `apps/client/src/*`, `apps/e2e/tests/trip.spec.ts` — DTO conventions, client data flow, E2E test style (HIGH)

---
*Architecture research for: shared packing-table integration into existing PackPixie monorepo*
*Researched: 2026-08-11*
