# Phase 5: Shared Item Model & Comments Cleanup - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 7 (1 created, 4 modified, 2 deleted)
**Analogs found:** 7 / 7 (every file has an in-repo pattern; contract is locked verbatim)

> This is a types-and-deletion phase. There is no new runtime logic. "Patterns" here are
> (a) the shared-DTO shape convention to mirror for the new `item.ts`, and (b) the exact
> deletion surface + edit shape for each Comments removal site. Every analog was read this
> session; line numbers are current as of this mapping.

## File Classification

| New/Modified/Deleted File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------------|------|-----------|----------------|---------------|
| `packages/model/src/item.ts` (CREATE) | model (DTO) | transform (type contract) | `packages/model/src/trip.ts` | exact |
| `packages/model/src/index.ts` (MODIFY) | config (barrel) | — | itself (existing 3-line barrel) | exact |
| `packages/model/src/comment.ts` (DELETE) | model (DTO) | — | n/a (deletion) | n/a |
| `apps/api/src/routes/api.ts` (MODIFY: remove `/comments`) | route/controller | request-response | sibling `/trips` handlers in same file | exact |
| `apps/client/src/Comments.tsx` (DELETE) | component | request-response | n/a (deletion) | n/a |
| `apps/client/src/App.tsx` (MODIFY: drop import+usage) | component | — | existing import/JSX pattern in file | exact |
| `apps/client/src/api/api.ts` (MODIFY: drop 2 fns + 2 imports) | service (API client) | request-response | sibling `createTrip`/`getTrips` in same file | exact |

## Pattern Assignments

### `packages/model/src/item.ts` (CREATE — model DTO, type contract)

**Analog:** `packages/model/src/trip.ts` (the camelCase shared-DTO template D-01 follows)

**Convention to copy** — plain `export interface` / `export type`, camelCase full-word fields, ISO-string dates, no classes, no runtime code (`packages/model/src/trip.ts:1-6`):
```ts
export interface Trip {
  tripId: string;
  tripName: string;
  createdAt: string;
  participants: string[];
}
```

**Content to write** — implement D-02 + D-06 **verbatim** (do not re-derive field names). Note `quantity` spelled out (D-01); optional fields modeled as `?` = absent-means-unset (D-04); no `'unset'` in `ItemStatus`; no `PK`/`SK`/`GSI*` (D-06); `UsedBy`/`Carried` excluded (D-08):
```ts
export type ItemStatus = 'to-buy' | 'found' | 'packed';

export interface Item {
  itemId: string;
  createdAt: string;
  name: string;
  quantity: number;
  weight?: number;      // absent = not set (distinct from 0)
  packedBy?: string;    // absent = unassigned; a member email when set
  status?: ItemStatus;  // absent = unset
  category?: string;
  consumable: boolean;
}

export interface TripDetailResponse {
  tripId: string;
  tripName: string;
  participants: string[];
  items: Item[];
}
```
`TripDetailResponse.participants: string[]` intentionally reuses the `Trip.participants` convention (array of participant emails). Placement (new `item.ts` vs extend `trip.ts`) is planner discretion, but the one-concept-per-file convention (`status.ts`, `trip.ts`) favors a new `item.ts`.

**Do NOT copy from `trip.ts`:** the request/response DTOs (`CreateTripRequest`, `CreateTripResponse`, `GetTripsResponse`). Write DTOs (`CreateItemRequest`/`UpdateItemRequest`) are deferred to Phase 7 (D-07). Phase 5 lands the read contract only.

---

### `packages/model/src/index.ts` (MODIFY — barrel)

**Analog:** itself — the existing 3-line barrel (`packages/model/src/index.ts:1-3`):
```ts
export * from './status.js';
export * from './trip.js';
export * from './comment.js';
```

**Edit shape** — add the item re-export, remove the comment re-export. Note the `.js` extension on `.ts` source (ESM convention, matches siblings):
```ts
export * from './status.js';
export * from './trip.js';
export * from './item.js';   // added
// './comment.js' removed
```

---

### `apps/api/src/routes/api.ts` (MODIFY — remove `/comments` route handlers)

**Analog:** the sibling `/trips` handlers in the same file — same `protected_.get`/`protected_.post` shape, so the surrounding structure after deletion is self-evidently correct.

**Delete surface** — the two protected handlers `GET /comments` (`apps/api/src/routes/api.ts:99-116`) and `POST /comments` (`apps/api/src/routes/api.ts:118-143`), i.e. the whole `COMMENTS` query/put blocks. They sit between `await protected_.register(authPlugin(conf));` (line 97) and the `// Trip routes` comment (line 145). After removal, the protected scope opens directly with the trip routes:
```ts
// Protected routes (auth required)
fastify.register(async function (protected_) {
  await protected_.register(authPlugin(conf));

  // Trip routes
  protected_.post<{ Body: CreateTripRequest }>(
    '/trips',
    ...
```

**Import cleanup check:** the model import block (`apps/api/src/routes/api.ts:9-15`) imports only `DBStatus`, `StatusResponse`, `CreateTripRequest`, `CreateTripResponse`, `GetTripsResponse` — **no comment types** — so no import edit is needed here. Verify `QueryCommand`/`PutCommand` (imported lines 2-8) are still used by the surviving trip routes before removing any SDK import (they are used elsewhere; do not remove blindly — confirm via the compiler). Do NOT touch the `// Do not remove TODO comments` category — these are code comments about the `COMMENTS` feature, not TODOs.

---

### `apps/client/src/api/api.ts` (MODIFY — remove comment API functions + type imports)

**Analog:** the surviving sibling functions `getTrips` (`apps/client/src/api/api.ts:30-37`) and `createTrip` (62-76) — identical `getAuthHeaders()` + `fetch` + `response.ok` guard shape, so the file remains coherent after removing the comment twins.

**Delete surface:**
- `getComments` (`apps/client/src/api/api.ts:39-47`) and `postComment` (49-60) functions.
- `TripComment` (line 5) and `GetCommentsResponse` (line 6) from the import block.

**Import edit** — the import block (`apps/client/src/api/api.ts:1-7`) mixes still-needed and to-remove types. Keep exactly the three still used (`StatusResponse`, `CreateTripResponse`, `GetTripsResponse`); a partial edit that leaves a dangling `TripComment` import (or removes a still-used one) is the primary hazard here (RESEARCH Pitfall 3):
```ts
import type {
  StatusResponse,
  CreateTripResponse,
  GetTripsResponse,
} from '@packpixie/model';
```

---

### `apps/client/src/App.tsx` (MODIFY — remove Comments import + usage)

**Delete surface:** `import Comments from './Comments';` (`apps/client/src/App.tsx:6`) and the `<Comments />` render (`apps/client/src/App.tsx:54`, sits directly after `<StatusChecker />`). No other references. The surrounding JSX/import pattern is unchanged.

---

### `apps/client/src/Comments.tsx` (DELETE — component)

**Delete the entire file** (`apps/client/src/Comments.tsx`, 133 lines). It is the only importer of `getComments`/`postComment`/`TripComment` on the client, so it must be removed together with the `api.ts` and `App.tsx` edits above.

---

### `packages/model/src/comment.ts` (DELETE — model DTO)

**Delete the entire file** (`packages/model/src/comment.ts`, 9 lines: `TripComment`, `GetCommentsResponse`). Paired with the `index.ts` barrel line removal above.

---

## Shared Patterns

### Shared-DTO convention (applies to `item.ts`)
**Source:** `packages/model/src/trip.ts:1-6`, `packages/model/src/status.ts:1-14`
**Apply to:** the new `item.ts`
Plain `export interface`/`export type`, camelCase full-word fields, ISO-string dates, no runtime code. One concept per file, re-exported through `index.ts` with a `.js` extension.

### ESM `.js` re-export / import extensions
**Source:** `packages/model/src/index.ts:1-3` (barrel), CLAUDE.md convention (`apps/api` relative imports use `.js`)
**Apply to:** the `index.ts` barrel edit (`./item.js`); any relative import touched in `apps/api/src/routes/api.ts`.

### Deletion completeness gate ("leave nothing unused behind")
**Source:** CLAUDE.md convention; RESEARCH Runtime State Inventory
**Apply to:** all Comments-removal edits, as ONE coherent change (D-09)
The full source removal surface is exactly the 7 rows above — confirmed by `grep -rni comment apps packages` this session: no references exist outside these sites (the only other hits are stale `packages/model/dist/` build artifacts). Verify with `pnpm build && pnpm type-check` **and** the grep gate returning empty (dist excluded or after `pnpm clean`). Rebuild the model package so stale `dist/comment.d.ts` cannot mask an incomplete removal (RESEARCH Pitfall 1). No DynamoDB `COMMENTS` data migration (D-09).

## No Analog Found

None. Every created/modified file has a direct in-repo pattern (the `Trip` DTO for `item.ts`; sibling handlers/functions for the deletion sites). The `Item`/`TripDetailResponse` contract itself is fully locked (D-02/D-06) and must be implemented verbatim rather than derived from an analog.

## Open Item for Planner (from RESEARCH Q1)

SC#2 ("both `apps/api` and `apps/client` import the new types") has **no clean analog** because neither app has a real consumer until Phases 6/8, and CLAUDE.md forbids dead token imports. This is a scoping decision, not a pattern gap — the planner must pick: (a) treat SC#2 as met once the model builds and both apps' `type-check` passes against the updated `@packpixie/model` (real imports deferred to 6/8), or (b) add a genuine soon-used consumer (e.g. a typed `getTripDetail(tripId): Promise<TripDetailResponse>` stub in `apps/client/src/api/api.ts` mirroring the `getTrips` pattern). Do NOT add artificial dead imports.

## Metadata

**Analog search scope:** `packages/model/src/`, `apps/api/src/routes/`, `apps/client/src/`, `apps/client/src/api/`
**Files scanned:** 8 (trip.ts, index.ts, status.ts, comment.ts, api/api.ts, App.tsx, routes/api.ts §1-160, Comments.tsx) + full `grep -rni comment` audit
**Pattern extraction date:** 2026-08-12
