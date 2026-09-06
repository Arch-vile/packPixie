# Phase 7: Item Write API & Server-Authoritative Rules - Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 4 (1 modified route file, 1 modified/extended lib module, 2 read-only canonical refs)
**Analogs found:** 3 / 3 (no "no analog" files — this phase extends code that already exists)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/src/routes/api.ts` (add `POST/PATCH/DELETE /trips/:tripId/items[/:itemId]`) | route/controller | CRUD (request-response) | `GET /trips/:tripId` handler in same file (lines 240-291); `POST /trips` handler (lines 101-186) for the write/id-generation half | exact (same file, same route family) |
| `apps/api/src/lib/tripDetail.ts` (add inverse mapper: DTO/body → storage attrs, and/or validation helpers) | utility/mapper | transform | `mapItemRecord` in the same file (lines 13-26) | exact (inverse of existing function, same module) |
| `packages/model/src/item.ts` (possibly add `CreateItemRequest`/`UpdateItemRequest` DTOs — read-only reference, not necessarily modified) | model | n/a | `Item`/`TripDetailResponse` interfaces (lines 1-20) | exact |

No genuinely new architectural role is introduced — this phase is additive to an existing route file and an existing lib module. There is no separate "no analog" category.

## Pattern Assignments

### `apps/api/src/routes/api.ts` — new item write routes (controller, CRUD/request-response)

**Analog A — participation guard + 404 (enumeration-resistant), from `GET /trips/:tripId`** (`apps/api/src/routes/api.ts` lines 240-271):
```typescript
protected_.get<{ Params: { tripId: string } }>(
  '/trips/:tripId',
  async (request, reply): Promise<TripDetailResponse> => {
    const { tripId } = request.params;
    // Identity comes only from the verified JWT, never the path param
    // or body. Lowercase to match the write-path USER# key normalization.
    const callerEmail = request.user.email.trim().toLowerCase();

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: conf.dynamoDBTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `TRIP#${tripId}`,
        },
      }),
    );

    const records = result.Items ?? [];

    // Participation guard (enumeration-resistant): a single branch
    // serves both failure modes — non-existent trip (zero records) and
    // foreign trip (records but no matching USER#). Both yield an
    // identical 404; never a 403, never a distinguishable response.
    const isMember = records.some(
      (r) => (r.SK as string) === `USER#${callerEmail}`,
    );
    if (!isMember) {
      return reply
        .status(404)
        .send({ error: 'Trip not found' }) as never;
    }
    ...
```
**Copy verbatim for all three new handlers**: fetch `PK = TRIP#<tripId>` (POST can reuse the same query to also get participant emails for the D-04 `PackedBy` cross-check in one round trip; PATCH/DELETE additionally need to find the specific `ITEM#<itemId>` record from the same query result to enforce 404-for-unknown-item using the identical `reply.status(404).send({ error: '...' })` shape — never 403, per D-09/canonical refs). Use `'Trip not found'` for non-member; use a distinct message like `'Item not found'` for a valid trip but missing/foreign item (still 404 status, so enumeration-resistance for trip membership is preserved; item-not-found is not a security boundary in the same sense but should stay 404 per the roadmap SC #4 "no phantom-row upserts").

**Analog B — id generation, `now`, and `reply.status(N).send(...)` write pattern, from `POST /trips`** (`apps/api/src/routes/api.ts` lines 101-185):
```typescript
protected_.post<{ Body: CreateTripRequest }>(
  '/trips',
  async (request, reply): Promise<CreateTripResponse> => {
    const { tripName, participantEmails } = request.body;
    const userEmail = request.user.email;

    if (!tripName?.trim()) {
      return reply
        .status(400)
        .send({ error: 'tripName is required' }) as never;
    }

    const tripId = randomUUID();
    const now = new Date().toISOString();
    const pk = `TRIP#${tripId}`;
    ...
    await dynamoDBClient.send(new TransactWriteCommand({ ... }));
    ...
    return reply.status(201).send({ tripId, tripName: name, createdAt: now });
  },
);
```
Copy: `randomUUID()` import (already imported at top of `api.ts` line 23) for the new `ITEM#<id>` SK suffix (D-02); `new Date().toISOString()` for `CreatedAt`; the `400` validation-then-`reply.status(400).send({ error: '<specific message>' }) as never` idiom (D-03) — note the `as never` cast used to satisfy the handler's declared return type when short-circuiting with an error reply, reuse this cast in the new handlers too; `201` on successful create, presumably `200` for PATCH (returning updated item) and `204`/`200` for DELETE — planner's call, but follow the existing `reply.status(N).send(...)` idiom, never a bare `return` object.

**Route registration placement**: register the three new routes inside the same `protected_.register(async function (protected_) { ... })` block (lines 97-292), immediately after or interleaved with the existing `/trips/:tripId` GET (line 240) — same `protected_` instance, same `authPlugin(conf)` already applied at line 98, no new plugin wiring needed.

**Imports to add** (top of file, alongside existing lines 1-23): `UpdateCommand`, `DeleteCommand` from `@aws-sdk/lib-dynamodb` (sibling to the already-imported `QueryCommand`, `TransactWriteCommand`, `BatchWriteCommand` at lines 2-7); no new import needed for `randomUUID` (already imported line 23) or `mapItemRecord` (already imported line 21 from `../lib/tripDetail.js` — note the `.js` extension convention per CLAUDE.md).

---

### `apps/api/src/lib/tripDetail.ts` — inverse mapper / validation helpers (utility, transform)

**Analog — `mapItemRecord`, the storage→DTO mapper this phase must produce the exact inverse of** (`apps/api/src/lib/tripDetail.ts` lines 13-26):
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
**Contract to mirror exactly (attribute names are locked, per Phase 6 D-04 and this file's own header comment, lines 3-12):** `Name`/`Qty`/`Weight`/`PackedBy`/`Status`/`Consumable`/`Category`, SK `ITEM#<id>`, `CreatedAt`. New writer function(s) added to this same module (e.g. `buildCreateItemAttributes(body, tripId, itemId, now)` and `buildItemUpdateExpression(current, patch)`) should:
- Use the same "conditional assignment, never object spread" discipline in reverse: only set a storage attribute when the DTO field is present/non-undefined; when a PATCH clears `weight`/`packedBy`/`status`, the update expression must `REMOVE` the attribute (not set to `null`/`0`) — this is the D-Weight/PackedBy "absent, never 0 or null" convention called out in CONTEXT.md's Claude's Discretion section, and it's the direct write-side mirror of the `if (r.X !== undefined)` read-side checks above.
- Reuse the `ItemStatus` type import (`import { Item, ItemStatus } from '@packpixie/model';` — already at line 1 of this file) for typing the PATCH body's `status` field.
- Live in the same module as `mapItemRecord` per CONTEXT.md's Claude's Discretion note ("already a candidate location per Phase 6's discretion note") — keeps the storage-attribute contract (read + write) colocated in one file rather than re-derived/duplicated in `routes/api.ts`.

---

### `packages/model/src/item.ts` — DTO reference (model, n/a — read-only unless new request types are added)

**Current shape to build request DTOs against** (`packages/model/src/item.ts` lines 1-20):
```typescript
export type ItemStatus = 'to-buy' | 'found' | 'packed';

export interface Item {
  itemId: string;
  createdAt: string;
  name: string;
  quantity: number;
  consumable: boolean;
  weight?: number;
  packedBy?: string;
  status?: ItemStatus;
  category?: string;
}
```
If the planner adds `CreateItemRequest`/`UpdateItemRequest`/`PatchItemRequest` types (needed for `PATCH`'s fastify generic body typing, D-05's "reject unknown fields" validation, and mirrors how `CreateTripRequest`/`CreateTripResponse` already exist alongside `Item`/`TripDetailResponse` in the same package), place them in this file or a sibling in `packages/model/src/`, following the same plain-interface style (no decorators/classes, no runtime validation library in use anywhere in this package — see Shared Patterns below for how validation is instead done inline in the route handler).

## Shared Patterns

### Participation guard / 404-not-403
**Source:** `apps/api/src/routes/api.ts` lines 264-271 (`GET /trips/:tripId`)
**Apply to:** All three new write handlers (POST/PATCH/DELETE items)
```typescript
const isMember = records.some(
  (r) => (r.SK as string) === `USER#${callerEmail}`,
);
if (!isMember) {
  return reply.status(404).send({ error: 'Trip not found' }) as never;
}
```
Email always comes from `request.user.email.trim().toLowerCase()` — never from params/body (CLAUDE.md convention, restated Phase 6 D-02/Phase 5 D-05). For PATCH/DELETE, extend this same query result to also locate the target `ITEM#<itemId>` record and 404 if absent (roadmap SC #4, no phantom-row upserts) — identical treatment for non-member and unknown-item, per CONTEXT.md D-09 restatement.

### Structured 400 error replies
**Source:** `apps/api/src/routes/api.ts` lines 107-111 (`POST /trips` tripName validation)
**Apply to:** All validation failures in the new handlers (D-03: unknown Status without PackedBy, PackedBy not a participant, unknown/extra PATCH fields, delete-while-packed)
```typescript
if (!tripName?.trim()) {
  return reply
    .status(400)
    .send({ error: 'tripName is required' }) as never;
}
```
One specific message per violated rule, e.g. `'packed requires PackedBy to be set'` (D-03), `'PackedBy must be a trip participant'` (D-04), `'Unknown field: <name>'` (D-05), `'Cannot delete a packed item — unpack it first'` (D-09).

### Id generation and timestamp
**Source:** `apps/api/src/routes/api.ts` lines 23, 113-114
```typescript
import { randomUUID } from 'crypto';
...
const tripId = randomUUID();
const now = new Date().toISOString();
```
Apply identically for new `itemId` generation on create (D-02) and `CreatedAt` timestamp.

### DynamoDB client usage
**Source:** `apps/api/src/lib/dynamodb.ts` (whole file, 32 lines)
`removeUndefinedValues: true` is already configured on the shared client — new write code can pass `undefined` for an omitted optional field on `PutCommand`/`TransactWriteCommand` `Put` items and it will be omitted from storage automatically (relevant to the create-path "absent Weight" behavior in CONTEXT.md's Claude's Discretion note). For `UpdateCommand`, `removeUndefinedValues` does NOT apply to `UpdateExpression`/`ExpressionAttributeValues` the same way — an explicit `REMOVE <attr>` clause in the update expression is required to clear an existing attribute (e.g. clearing `PackedBy`/`Status`/`Weight` on PATCH); do not rely on passing `undefined` in an `UpdateCommand`'s value map to remove an attribute.

### Auth / identity
**Source:** `apps/api/src/plugins/auth.ts` lines 6-9, 36-39
```typescript
export interface AuthUser {
  sub: string;
  email: string;
}
...
request.user = { sub: payload.sub, email: payload.email as string };
```
`request.user.email` is the only source of caller identity (CLAUDE.md, already enforced by the `authPlugin` hook applied to the `protected_` scope at line 98 of `api.ts`); no changes needed to this plugin for Phase 7 — it's a pure dependency, not a file to modify.

## No Analog Found

None. This phase is purely additive to two existing files (`apps/api/src/routes/api.ts`, `apps/api/src/lib/tripDetail.ts`) whose sibling functions/handlers are direct analogs for the new write logic, plus a read-only reference to `packages/model/src/item.ts`.

## Metadata

**Analog search scope:** `apps/api/src/routes/`, `apps/api/src/lib/`, `apps/api/src/plugins/`, `packages/model/src/`
**Files scanned:** 4 read in full (all ≤ 300 lines; single Read call each, no re-reads needed); searched for `*.test.ts`/`*.spec.ts` and existing `UpdateCommand`/`DeleteCommand` usage in `apps/api/src` — none found (no test-file analog exists yet; PATCH/DELETE DynamoDB command usage has no prior in-repo example, follow AWS SDK v3 `lib-dynamodb` conventions directly).
**Pattern extraction date:** 2026-09-04
