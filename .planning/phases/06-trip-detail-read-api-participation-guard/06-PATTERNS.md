# Phase 6: Trip-Detail Read API & Participation Guard - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 4 (1 modified code file, 1 possibly-new code module, 2 modified docs)
**Analogs found:** 2 / 2 code files (docs have no code analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/src/routes/api.ts` (MODIFIED — add `GET /trips/:tripId`) | route | request-response (read/query) | `GET /trips` handler in the **same file** (`api.ts:186-236`) | exact |
| `apps/api/src/lib/tripDetail.ts` (POSSIBLY NEW — discretion) | utility (mapper/transform) | transform (storage record → DTO) | participant-extraction block in `GET /trips` (`api.ts:220-223`) + module style of `lib/dynamodb.ts` | role-match |
| `dynamoDB-architecture.md` (MODIFIED — docs) | config (docs) | — | none (doc edit) | no analog |
| `app-architecture.md` (MODIFIED — docs §5/§5.2) | config (docs) | — | none (doc edit) | no analog |

## Pattern Assignments

### `apps/api/src/routes/api.ts` — add `GET /trips/:tripId` (route, request-response)

**Analog:** the existing `GET /trips` handler in the **same file** (`api.ts:186-236`) and the `POST /trips` early-return convention (`api.ts:99-108`). Copy the query shape, participant extraction, protected-block registration, and `{ error }` reply convention verbatim; add the membership predicate and item mapping.

**Imports pattern** (`api.ts:8-14`) — extend this existing `@packpixie/model` barrel import; add `TripDetailResponse` (and `Item`, `ItemStatus` if the mapper is inline). `@packpixie/model` re-exports `item.ts` via `packages/model/src/index.ts`, so a bare specifier works:
```typescript
import {
  DBStatus,
  StatusResponse,
  CreateTripRequest,
  CreateTripResponse,
  GetTripsResponse,
  TripDetailResponse, // ADD
} from '@packpixie/model';
```
If the mapper is extracted to `lib/tripDetail.ts`, import it with a **`.js` extension** (CLAUDE.md ESM rule), mirroring `import { authPlugin } from '../plugins/auth.js';` (`api.ts:19`):
```typescript
import { mapItemRecord } from '../lib/tripDetail.js';
```

**Protected-route registration** (`api.ts:95-97`, `186-188`) — register the new route **inside** the existing `protected_` block, right after `GET /trips`, so `authPlugin` runs first and `request.user` is populated (D-09). Type the params generic exactly as the `POST /trips` body generic is typed (`api.ts:99`):
```typescript
fastify.register(async function (protected_) {
  await protected_.register(authPlugin(conf));
  // ... existing POST /trips, GET /trips ...

  protected_.get<{ Params: { tripId: string } }>(
    '/trips/:tripId',
    async (request, reply): Promise<TripDetailResponse> => { /* ... */ },
  );
});
```

**Single-query + parameterized key** — copy the `QueryCommand` shape from `GET /trips`'s inner per-trip query (`api.ts:209-218`), which already uses `KeyConditionExpression: 'PK = :pk'` with a parameterized `:pk` (satisfies D-01/D-10). **Do NOT** copy its `ProjectionExpression: 'SK, Email'` — this handler needs all item attributes, and `Name`/`Status` are DynamoDB reserved words (Pitfall 2):
```typescript
// Analog: api.ts:209-218 (drop ProjectionExpression; drop IndexName)
const result = await dynamoDBClient.send(
  new QueryCommand({
    TableName: conf.dynamoDBTable,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `TRIP#${tripId}` },
  }),
);
const records = result.Items ?? [];
```

**Membership guard + 404 reply** — NEW predicate, but the reply shape copies the exact `{ error }` early-return convention from `POST /trips` (`api.ts:106-108`), including the `as never` cast so the `Promise<TripDetailResponse>` return type still checks (Pitfall 5). One branch for both failure modes → byte-identical 404 (D-02/D-03):
```typescript
// Reply convention copied from api.ts:106-108 (reply.status(N).send({ error }) as never)
const callerEmail = request.user.email.trim().toLowerCase();
if (!records.some((r) => (r.SK as string) === `USER#${callerEmail}`)) {
  return reply.status(404).send({ error: 'Trip not found' }) as never;
}
```
> Identity normalization mirrors the write path's `userEmail.trim().toLowerCase()` at `api.ts:115` — required so a mixed-case JWT email matches the lowercased stored `USER#` key (Pitfall 4).

**Participant extraction** — copy verbatim from `GET /trips` (`api.ts:220-223`): filter `SK` starts-with `USER#`, map `Email`, drop falsy (D-06). Reuse the same idiom for `META#`/`ITEM#` partitioning:
```typescript
// Copied verbatim from api.ts:220-223
const participants = records
  .filter((r) => (r.SK as string).startsWith('USER#'))
  .map((r) => r.Email as string)
  .filter(Boolean);

const meta = records.find((r) => (r.SK as string).startsWith('META#'));
const items = records
  .filter((r) => (r.SK as string).startsWith('ITEM#'))
  .map(mapItemRecord);
```

**Explicit-field DTO return** — build the response object literally, never spread a DB record (D-05). The `GET /trips` handler already models this: its per-trip return (`api.ts:225-230`) assembles `{ tripId, tripName, createdAt, participants }` field-by-field from `item.*`, never spreading. Mirror that:
```typescript
// Explicit-field construction, mirroring api.ts:225-230 (no spread of DB record)
return {
  tripId,
  tripName: (meta?.TripName as string) ?? '',
  participants,
  items,
};
```
> `items` is `[]` this phase (no writer until Phase 7) — the correct expected result.

---

### `apps/api/src/lib/tripDetail.ts` — item mapper (utility, transform) — POSSIBLY NEW (Claude's Discretion)

**Analog (module shape):** `apps/api/src/lib/dynamodb.ts` — the only existing file in `apps/api/src/lib/`. It is a plain `export function` utility module with no Fastify coupling. Match that style: a stateless exported function, no side effects, `.js`-free bare imports for packages.

**Analog (transform logic):** the participant-extraction / explicit-field shaping in `GET /trips` (`api.ts:220-230`) — same "read a raw DynamoDB record, pick fields, produce a clean object" transform, one level richer (conditional optional keys).

**Imports pattern** — package types from `@packpixie/model` (bare specifier — barrel re-exports `item.ts`):
```typescript
import { Item, ItemStatus } from '@packpixie/model';
```

**Core transform pattern (D-04/D-05)** — required keys always assigned, optional keys assigned **only when the storage attribute is present** (absent → absent DTO key, never `null`/`""`/`0`). Storage attribute names (`Name`/`Qty`/`Weight`/`PackedBy`/`Status`/`Consumable`/`Category`/`CreatedAt`, SK `ITEM#<id>`) are the **cross-phase contract Phase 7's writer MUST match**:
```typescript
export function mapItemRecord(r: Record<string, unknown>): Item {
  const item: Item = {
    itemId: (r.SK as string).replace('ITEM#', ''),
    createdAt: r.CreatedAt as string,
    name: r.Name as string,
    quantity: r.Qty as number,
    consumable: r.Consumable as boolean,
  };
  if (r.Weight !== undefined) item.weight = r.Weight as number;
  if (r.PackedBy !== undefined) item.packedBy = r.PackedBy as string;
  if (r.Status !== undefined) item.status = r.Status as ItemStatus;
  if (r.Category !== undefined) item.category = r.Category as string;
  return item;
}
```
> Conditional assignment (not object spread) is what guarantees absent-key semantics (D-04) and keeps internal keys (`PK`/`SK`/`GSI*`) out of the DTO (D-05).

**Optional companion** `shapeTripDetail(records, callerEmail): TripDetailResponse | null` — if the planner splits guard+shape out of the handler, `null` signals the 404 branch (handler translates `null → reply.status(404)`). The `null`-means-404 contract keeps the enumeration-resistant single-branch property (D-02) intact. This is discretion; inline in the handler is equally acceptable.

---

### `dynamoDB-architecture.md` (docs, D-07) — no code analog

Correction target only — no pattern to copy. Edits: Participant row `USER#<UserId>` → `USER#<email>` (SK + both GSI1 columns), `PackedBy` description → "stores the participant email", access-pattern B `GSI1PK = USER#<UserId>` → `USER#<email>`. Leave `UsedBy`/`Carried` `<UserId>` bodies (deferred Distribution) but add a one-line note that participant identity everywhere is the lowercased email. **Ground truth for the corrected values is the live write path** (`api.ts:137-141`): `SK: USER#<creatorEmail>`, `GSI1PK: USER#<creatorEmail>`, `Email: creatorEmail`, all lowercased — the doc must match this already-implemented reality.

### `app-architecture.md` §5/§5.2 (docs, D-08) — no code analog

Correction target only. Prepend a "superseded" banner to §5 pointing to `dynamoDB-architecture.md` as authoritative and stating participant identity is the verified JWT email; correct §5.2's `userId` identity refs to email in passing. Do not reconcile the rest of the fictional multi-table schema. (Narrower §5.2-only edit is acceptable per discretion, provided no stale `<UserId>` membership/`PackedBy` identity ref survives.)

---

## Shared Patterns

### Identity normalization (lowercased JWT email)
**Source:** `apps/api/src/routes/api.ts:115` (`userEmail.trim().toLowerCase()`), origin `apps/api/src/plugins/auth.ts:36-39` (`request.user.email` from verified `id`-token claim).
**Apply to:** the new handler's `callerEmail` and the `USER#<email>` guard key. MUST match the write path's lowercasing or a mixed-case member gets a false 404 (Pitfall 4).
```typescript
const callerEmail = request.user.email.trim().toLowerCase();
```

### Error reply convention
**Source:** `apps/api/src/routes/api.ts:106-108`.
**Apply to:** the 404 membership-failure branch. Use this exact shape (`reply.status(N).send({ error }) as never`) — **not** `@fastify/sensible`'s `reply.notFound()`, which emits `{ statusCode, error, message }` and breaks the byte-identical `{ error: 'Trip not found' }` contract (Pitfall 3, D-03).
```typescript
return reply.status(404).send({ error: 'Trip not found' }) as never;
```

### Shared DynamoDB client (no new wiring)
**Source:** `apps/api/src/lib/dynamodb.ts:21-29` — `DynamoDBDocumentClient` (`removeUndefinedValues: true`, `wrapNumbers: false`), already injected as `dynamoDBClient` into `apiRoutes(conf, dynamoDBClient)` (`api.ts:67-70`).
**Apply to:** the new handler's `QueryCommand`. Use the injected `dynamoDBClient` param directly — no new client, no marshalling code (values arrive as plain JS: `Qty` is a `number`, not `{ N: "1" }`).

### Protected-route registration
**Source:** `apps/api/src/routes/api.ts:95-97`.
**Apply to:** the new route — register inside the existing `protected_` block after `authPlugin(conf)` so `request.user` is guaranteed populated (D-09). Do not create a second register block.

### Parameterized DynamoDB key expression
**Source:** `apps/api/src/routes/api.ts:211-215`.
**Apply to:** the new `QueryCommand`. `tripId` flows only into `ExpressionAttributeValues` (`':pk': \`TRIP#${tripId}\``), never concatenated into `KeyConditionExpression` (D-10, injection-resistant).

## No Analog Found

| File | Role | Data Flow | Reason / Guidance |
|------|------|-----------|-------------------|
| `apps/api/src/lib/tripDetail.ts` (module *as a whole*) | utility | transform | No existing dedicated mapper module exists in the API; `lib/` holds only `dynamodb.ts`. **Partial analogs exist** (module style from `lib/dynamodb.ts`; transform logic from `api.ts:220-230`), so this is not analog-less — the planner assembles it from the two partial sources above plus the RESEARCH.md Pattern-3 skeleton. If the planner keeps the mapper inline in `api.ts` instead, no new file. |
| `dynamoDB-architecture.md`, `app-architecture.md` | docs | — | Documentation edits; no code pattern applies. Corrected values are grounded in the live write path (`api.ts:137-141`). |

## Metadata

**Analog search scope:** `apps/api/src/routes/`, `apps/api/src/lib/`, `apps/api/src/plugins/`, `packages/model/src/`.
**Files scanned:** `apps/api/src/routes/api.ts`, `apps/api/src/lib/dynamodb.ts`, `apps/api/src/plugins/auth.ts`, `packages/model/src/item.ts`, `packages/model/src/index.ts`.
**Key finding:** The strongest analog for the new route is the `GET /trips` handler in the **same file** — same `Query PK=TRIP#<tripId>` shape, same participant extraction, same `{ error }` reply convention. The new logic is only (a) the membership predicate and (b) the item mapper. Stored data is already email-keyed, so the docs are the sole stale artifact for TRIP-03.
**Pattern extraction date:** 2026-08-12
