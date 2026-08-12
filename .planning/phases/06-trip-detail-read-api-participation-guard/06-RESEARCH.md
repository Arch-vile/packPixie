# Phase 6: Trip-Detail Read API & Participation Guard - Research

**Researched:** 2026-08-12
**Domain:** Fastify protected route + DynamoDB single-table read + email-keyed authorization guard (enumeration resistance)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Exactly **one** DynamoDB `Query` with `KeyConditionExpression: PK = :pk`, `:pk = TRIP#<tripId>` — no `IndexName`, no separate guard `GetItem`, no second read. Partition the single result set by `SK` prefix: `META#` → meta, `USER#` → participants, `ITEM#` → items. Reversible.
- **D-02:** Guard = normalize caller identity as `request.user.email.trim().toLowerCase()`, then **404 unless a `USER#<normalizedEmail>` record is present** in the query result. Covers both failure modes identically (non-existent trip → zero records → 404; real trip, non-member → records but no matching `USER#` → 404). Presence of `META#` is **not** sufficient — membership is the sole gate. Costly (security contract).
- **D-03:** 404 uses existing convention `reply.status(404).send({ error: 'Trip not found' })`. **One identical message** for both foreign-trip and non-existent-trip cases — body, status, headers byte-identical. No `403` ever. Reversible.
- **D-04:** Dedicated mapper translates each stored `ITEM#` record (PascalCase) → camelCase `Item` DTO. Field map:
  - `itemId` ← strip `ITEM#` prefix from `SK`
  - `name` ← `Name`
  - `quantity` ← `Qty` (number)
  - `consumable` ← `Consumable` (boolean)
  - `weight` ← `Weight` (omit key when attribute absent)
  - `packedBy` ← `PackedBy` (omit when absent; lowercased participant email when set)
  - `status` ← `Status` (omit when absent; one of `to-buy`/`found`/`packed`)
  - `category` ← `Category` (omit when absent)
  - `createdAt` ← `CreatedAt` (Phase 7 populates on write; read forward-compatibly)
  Absent optional attributes become **absent DTO keys**, never `null`/`""`/`0`. This is the cross-phase storage contract Phase 7's writer MUST match. Costly.
- **D-05:** Response **constructed by explicit field assignment** — never spread or return raw DynamoDB items. Guarantees `PK`/`SK`/`GSI1PK`/`GSI1SK` are absent. Reversible.
- **D-06:** `participants` built from `USER#` records' `Email` attribute (reuse `GET /trips` pattern: filter `SK` starts-with `USER#`, map `Email`, drop falsy). `tripName` from `META#` record's `TripName`. Reversible.
- **D-07:** Correct `dynamoDB-architecture.md` in-scope identity refs: Participant row `USER#<UserId>` → `USER#<email>` (SK + both GSI1 columns), `PackedBy` description → stores participant email, access-pattern B `GSI1PK = USER#<UserId>` → `USER#<email>`. Leave `UsedBy`/`Carried` `<UserId>` bodies (deferred Distribution) but add a one-line note that participant identity everywhere is the lowercased email. Reversible.
- **D-08:** `app-architecture.md §5` is a stale multi-table schema. Prepend a short **"superseded" banner** to §5 pointing to `dynamoDB-architecture.md` as authoritative + stating participant identity is the verified JWT email, and correct §5.2's `userId` identity refs to email in passing. Do NOT reconcile the rest of the fictional schema. Reversible. (Judgment call — see discretion.)
- **D-09:** `GET /trips/:tripId` registered in the **protected scope** (inside `protected_.register(authPlugin(conf))` block), alongside `GET /trips` and `POST /trips`. Identity only from `request.user.email`, never params/body. Reversible.
- **D-10:** `tripId` from path param, used **only** as a parameterized `ExpressionAttributeValue` (`:pk = TRIP#<tripId>`) — never string-concatenated into a `KeyConditionExpression`. No strict UUID validation — a malformed/unknown `tripId` returns zero records → same 404 path. Reversible.

### Claude's Discretion

- Exact file location of item mapper (inline helper in `routes/api.ts` vs a small reusable `apps/api/src/lib/tripDetail.ts` module Phase 7/8 can reuse) — a reusable module is the natural fit.
- Whether guard/shape logic is one handler or split into small helpers.
- Exact wording of the D-08 doc banner; a narrower §5.2-only edit is acceptable as long as no stale `<UserId>` identity ref for membership/PackedBy survives.
- Whether to add a `@packpixie/model` import touchpoint on the API side now (endpoint returns `TripDetailResponse`, which naturally imports it).

### Deferred Ideas (OUT OF SCOPE)

- Item writes (create/edit/delete, `PackedBy`-is-a-member validation, `packed` requires `PackedBy`, clearing `PackedBy` resets `Status`, id/sort/`createdAt` population) → Phase 7.
- Trip-detail UI table + client fetch → Phase 8.
- `PackedBy = me` default view, status filter, show-all toggle → Phase 9 (client-side over the single snapshot).
- E2E coverage of the read endpoint + guard → Phase 10. **No new Playwright specs or test infra this phase.**
- `UsedBy`/`Carried`/Distribution identity → v2.x (doc mentions left with only an identity-is-email note).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRIP-02 | Item read/write requests return 404 for any non-participant (per-request participation guard; 404 not 403, to avoid leaking trip existence) | Membership guard pattern (D-02), enumeration-resistance pattern, existing `{ error }` reply convention verified in `api.ts:106-108`. This phase implements the **read** guard; the write guard reuses the same predicate in Phase 7. |
| TRIP-03 | All packing operations derive identity from the verified JWT email; `PackedBy`, default view, membership key off `request.user.email` (docs corrected `UserId`→email) | `request.user.email` origin verified in `auth.ts:36-39`; storage is **already** email-keyed in `api.ts:137-141`; docs are the only stale artifact (D-07/D-08). |
</phase_requirements>

## Summary

This is a tightly-scoped, low-risk phase: **one new protected Fastify route** (`GET /trips/:tripId`) plus a PascalCase→camelCase item mapper, and **two documentation corrections**. Every technical fact needed to plan it is already fixed in-repo — the new handler is a focused variant of the existing `GET /trips` handler (same `DynamoDBDocumentClient`, same `Query PK=TRIP#<tripId>` shape, same `filter SK starts-with USER# → map Email` participant extraction, same `reply.status(N).send({ error })` convention). No new packages, no client changes, no schema migration.

The single security-critical property is **enumeration resistance**: a non-member and a caller hitting a non-existent trip must receive a byte-identical `404 { error: 'Trip not found' }`. The clean way to satisfy this is D-01's single-query design — one `Query` returns zero-or-more records, and a single predicate (`is there a USER#<callerEmail> record?`) gates access. Both failure modes flow through the same 404 branch, so no code path, message, or status differs between them.

A notable finding: the stored data is **already** email-keyed (`api.ts` writes `SK: USER#<creatorEmail>`, `GSI1PK: USER#<creatorEmail>`, `Email: creatorEmail`, all lowercased). TRIP-03 is therefore a **docs-only** correction — the code needs no data migration; `dynamoDB-architecture.md` and `app-architecture.md §5` simply lag behind reality.

**Primary recommendation:** Extract a `apps/api/src/lib/tripDetail.ts` module exporting the item mapper and (optionally) a `shapeTripDetail(items, callerEmail)` function returning `TripDetailResponse | null` (null → 404). Register the route in the protected block, mirror the existing query/participant pattern, build the DTO by explicit field assignment, and gate on membership before shaping. Correct both docs per D-07/D-08. Since the API has **no unit-test framework**, validation is type-check + build + lint + a documented manual/curl verification matrix for the guard.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trip-detail read endpoint | API / Backend (Fastify) | — | Single-query read + response shaping is server work; client (Phase 8) only fetches the shaped snapshot |
| Participation guard (authorization) | API / Backend | — | Access control MUST be server-side from the verified JWT; never trust client/path/body |
| Identity resolution | API / Backend (from Cognito JWT via `authPlugin`) | — | `request.user.email` is set from verified `id` token claims in `auth.ts` |
| Storage→DTO mapping | API / Backend | — | PascalCase storage is an internal contract; client receives only the camelCase DTO |
| Default-view filter (`PackedBy = me`), status filter | Browser / Client (Phase 9) | — | Deferred; applied client-side over the single fetched snapshot, never a second DB read |
| Persistence / single-table query | Database (DynamoDB) | API | DynamoDB single-table `Query PK=TRIP#<id>` returns meta+participants+items in one round trip |

## Standard Stack

No new packages. The phase uses only what `apps/api` already depends on.

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `fastify` | ^5.5.0 | HTTP routing / request lifecycle | Project's backend framework [VERIFIED: apps/api/package.json:29] |
| `@aws-sdk/lib-dynamodb` | ^3.962.0 | `QueryCommand` + `DynamoDBDocumentClient` (auto marshalling) | Already the project's DynamoDB access layer [VERIFIED: apps/api/package.json:22] |
| `@aws-sdk/client-dynamodb` | ^3.962.0 | Low-level client wrapped by the Document client | Already installed [VERIFIED: apps/api/package.json:21] |
| `aws-jwt-verify` | ^5.1.1 | Cognito JWT verification (via `authPlugin`) | Produces `request.user.email` this guard keys off [VERIFIED: apps/api/package.json:26] |
| `@packpixie/model` | workspace:* | `TripDetailResponse`, `Item`, `ItemStatus` DTOs | Shared read contract, locked in Phase 5 [VERIFIED: packages/model/src/item.ts:1-20] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/sensible` | ^6.0.3 | Decorates `reply.unauthorized()` etc. | **Do NOT use `reply.notFound()` here** — it emits a different body shape than the `{ error }` convention D-03 requires (see Pitfall 3) [VERIFIED: apps/api/package.json:24, apps/api/src/plugins/auth.ts:30] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single `Query` + in-memory partition (D-01) | Separate `GetItem` membership check then `Query` | Two reads, a second code path, and a timing/shape difference between the "no META" and "no USER#" cases — weakens enumeration resistance. Rejected by D-01/D-02. |
| Explicit field-by-field DTO build (D-05) | Spread DynamoDB item / omit internal keys via destructuring | Fragile — any future stored attribute silently leaks (`PK`/`SK`/`GSI*`). Rejected by D-05. |

**Installation:** None — no packages added or removed this phase.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.** All libraries used are already present in `apps/api/package.json` (verified this session). No `npm install` step belongs in the plan.

## Architecture Patterns

### System Architecture Diagram

```
Client (Phase 8, out of scope)
   │  GET /api/trips/:tripId   Authorization: Bearer <Cognito id token>
   ▼
┌─────────────────────────── apps/api (Fastify) ───────────────────────────┐
│  protected_ register block                                                │
│     │                                                                     │
│     ▼  onRequest hook (authPlugin)                                        │
│  verify JWT ──► request.user = { sub, email }   (401 if missing/invalid)  │
│     │                                                                     │
│     ▼  GET /trips/:tripId handler                                         │
│  callerEmail = request.user.email.trim().toLowerCase()                    │
│  tripId      = request.params.tripId  (parameterized value only)          │
│     │                                                                     │
│     ▼  ONE DynamoDB Query:  KeyCondition PK = TRIP#<tripId>               │
│  ┌──────────── result.Items (flat array) ───────────┐                     │
│  │  partition by SK prefix:                          │                    │
│  │    META#  → { TripName }                          │                    │
│  │    USER#  → participants (Email)                  │                    │
│  │    ITEM#  → items (PascalCase → mapper)           │                    │
│  └───────────────────────────────────────────────────┘                    │
│     │                                                                     │
│     ▼  GUARD: any USER#<callerEmail> present?                             │
│        NO ─────────────► 404 { error: 'Trip not found' }  (byte-identical │
│        │                        for foreign AND non-existent trips)       │
│        YES                                                                │
│        ▼  shape TripDetailResponse by explicit field assignment          │
│        200 { tripId, tripName, participants[], items[] }                  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
apps/api/src/
├── routes/
│   └── api.ts          # add GET /trips/:tripId in the protected_ block
└── lib/
    ├── dynamodb.ts     # existing shared DynamoDBDocumentClient (unchanged)
    └── tripDetail.ts   # NEW (discretion): mapItemRecord() + shapeTripDetail()
```
> `apps/api/src/lib/` already exists (`dynamodb.ts`). A `tripDetail.ts` module is the natural home for the mapper Phase 7/8 will reuse. Remember `.js` extensions on relative imports (CLAUDE.md).

### Pattern 1: Single-query load + prefix partition (mirror of `GET /trips`)
**What:** One `Query` on `PK = TRIP#<tripId>`, then split `result.Items` by `SK` prefix.
**When to use:** Always for this endpoint (D-01).
**Example:**
```typescript
// Pattern grounded in existing GET /trips handler [VERIFIED: apps/api/src/routes/api.ts:191-232]
const result = await dynamoDBClient.send(
  new QueryCommand({
    TableName: conf.dynamoDBTable,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `TRIP#${tripId}` },
    // NO ProjectionExpression — we need all item attributes.
    // (If one were added, Name/Status are reserved words — see Pitfall 2.)
  }),
);
const items = result.Items ?? [];
```

### Pattern 2: Membership guard before shaping (enumeration resistance)
**What:** Compute `callerEmail`, check for `USER#<callerEmail>` presence, 404 if absent — one branch for both failure modes.
**Example:**
```typescript
const callerEmail = request.user.email.trim().toLowerCase();

const isMember = items.some(
  (r) => (r.SK as string) === `USER#${callerEmail}`,
);
if (!isMember) {
  // Identical for foreign trip AND non-existent trip (D-02, D-03).
  return reply.status(404).send({ error: 'Trip not found' }) as never;
}
```
> `as never` mirrors the existing early-return type cast at `api.ts:106-108` so the handler's `Promise<TripDetailResponse>` return type still checks.

### Pattern 3: Explicit-field DTO construction (no internal keys)
**What:** Build `Item` / `TripDetailResponse` field-by-field; never spread raw records.
**Example:**
```typescript
// Storage attribute names are the D-04 cross-phase contract [VERIFIED: .planning/.../06-CONTEXT.md:32-42]
// and match dynamoDB-architecture.md §2-§3 [VERIFIED: dynamoDB-architecture.md:21,29-37]
function mapItemRecord(r: Record<string, unknown>): Item {
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
> Absent optional attributes → **absent DTO keys** (D-04), never `null`/`""`/`0`. This is why the mapper uses conditional assignment, not object spread.

### Anti-Patterns to Avoid
- **Spreading the DynamoDB record into the response** — leaks `PK`/`SK`/`GSI1PK`/`GSI1SK`. Violates D-05 / SC #1.
- **Returning 403 for non-members** — reveals the trip exists. Must be 404 (D-02/D-03).
- **Different messages/branches for "no trip" vs "not a member"** — enables enumeration by response diffing. One byte-identical 404.
- **A separate `GetItem` membership pre-check** — second read + second code path; timing/shape differences leak. Use the single query (D-01).
- **String-concatenating `tripId` into the key expression** — always a parameterized `ExpressionAttributeValue` (D-10).
- **Trusting `tripId` (or any body/param) as identity** — identity is `request.user.email` only (CLAUDE.md, D-09).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DynamoDB attribute marshalling | Manual `AttributeValue` (`{S:...}`) packing/unpacking | `DynamoDBDocumentClient` from `lib/dynamodb.ts` (already `removeUndefinedValues:true`, `wrapNumbers:false`) | Existing shared client returns plain JS values [VERIFIED: apps/api/src/lib/dynamodb.ts:21-29] |
| JWT verification / identity | Custom token parsing | `authPlugin` (`aws-jwt-verify`) sets `request.user.email` | Verified path already in the protected block [VERIFIED: apps/api/src/plugins/auth.ts:35-39] |
| Participant extraction | New logic | Reuse `filter(SK startsWith 'USER#') → map(Email) → filter(Boolean)` | Exact pattern exists [VERIFIED: apps/api/src/routes/api.ts:220-223] |
| Item DTO shape | Re-derive field names | `Item`/`TripDetailResponse` from `@packpixie/model` | Locked Phase 5 contract, implement verbatim [VERIFIED: packages/model/src/item.ts:3-20] |

**Key insight:** Nearly everything this handler needs already exists in `api.ts`/`auth.ts`/`dynamodb.ts`. The only genuinely new logic is (a) the membership predicate and (b) the item mapper — both small and fully specified by CONTEXT.

## Runtime State Inventory

> Included because TRIP-03 involves a `UserId`→`email` correction. The correction is **docs-only** — the code and stored data are already email-keyed.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | **None affected.** `POST /trips` already writes `SK: USER#<creatorEmail>`, `GSI1PK: USER#<creatorEmail>`, `Email: creatorEmail`, all `.trim().toLowerCase()` [VERIFIED: apps/api/src/routes/api.ts:115,137-141,151-153,160-169]. No `<UserId>` is stored anywhere; no data migration. | None (code edit only, which is the new read route) |
| Live service config | None — no external service embeds `UserId`; identity is derived per-request from the Cognito JWT. | None |
| OS-registered state | None — no schedulers/daemons reference this identity. | None |
| Secrets / env vars | None renamed — Cognito pool/client IDs (`cognitoUserPoolId`, `cognitoClientId`) are unchanged and unrelated to the doc correction. | None |
| Build artifacts | None — no compiled artifact carries `UserId` as data. | None |

**The canonical question — after every repo file is updated, what still holds the old string?** Only the two documentation files (`dynamoDB-architecture.md`, `app-architecture.md §5`), which are stale *relative to already-correct code*. There is no runtime state to migrate. This is a pure docs-catch-up, not a rename.

## Common Pitfalls

### Pitfall 1: Enumeration leak via divergent 404 responses
**What goes wrong:** "Trip not found" and "you're not a member" get different messages, status codes, headers, or even different latency — letting an attacker probe which trip IDs exist.
**Why it happens:** Natural instinct to return a helpful/distinct error per case.
**How to avoid:** One code branch, one literal `reply.status(404).send({ error: 'Trip not found' })` (D-03). Both the zero-records case and the records-but-no-membership case must reach the *same* return statement. Do not branch on `META#` presence.
**Warning signs:** Any `if (noMeta) return 404A; if (notMember) return 404B;` structure; any 403; any conditional message string.

### Pitfall 2: Reserved-word `ProjectionExpression`
**What goes wrong:** Adding `ProjectionExpression: 'Name, Status, Qty, ...'` throws `Attribute name is a reserved keyword` — `Name` and `Status` are DynamoDB reserved words.
**Why it happens:** Trying to trim payload like `GET /trips` does (`ProjectionExpression: 'SK, Email'` — those happen not to be reserved).
**How to avoid:** For this endpoint **omit `ProjectionExpression` entirely** — the handler needs all item attributes anyway. If projection is ever added, alias reserved words via `ExpressionAttributeNames` (`#name`, `#status`).
**Warning signs:** `ValidationException` mentioning "reserved keyword" at query time.

### Pitfall 3: `@fastify/sensible` `reply.notFound()` breaks the 404 body contract
**What goes wrong:** `reply.notFound('Trip not found')` emits `{ statusCode: 404, error: 'Not Found', message: 'Trip not found' }` — a **different shape** than the project's `{ error: 'Trip not found' }` convention, and different from what any future write guard emits.
**Why it happens:** `sensible` is registered (auth uses `reply.unauthorized`), so `reply.notFound` is tempting.
**How to avoid:** Use the explicit `reply.status(404).send({ error: 'Trip not found' })` per D-03. Consistency matters for the byte-identical requirement and for Phase 7's write guard reusing the same body.
**Warning signs:** Response body containing `statusCode`/`message` keys.

### Pitfall 4: Case-mismatch on the membership comparison
**What goes wrong:** Comparing raw `request.user.email` (possibly mixed-case from the IdP) against stored lowercased `USER#<email>` records → a real member gets a false 404.
**Why it happens:** Cognito/Google email claims are not guaranteed lowercase; stored emails are lowercased at write time [VERIFIED: apps/api/src/routes/api.ts:115,151-152].
**How to avoid:** Always `request.user.email.trim().toLowerCase()` before building `USER#<email>` (D-02), matching the write path exactly.
**Warning signs:** Intermittent 404s for users whose email has uppercase letters.

### Pitfall 5: Handler return-type vs early-return `reply`
**What goes wrong:** `return reply.status(404).send(...)` inside a handler typed `Promise<TripDetailResponse>` fails type-check.
**How to avoid:** Cast the error-path send `as never`, mirroring the existing 400 path at `api.ts:106-108`.
**Warning signs:** `tsc --noEmit` error about `FastifyReply` not assignable to `TripDetailResponse`.

### Pitfall 6: Missing `.js` on the new relative import
**What goes wrong:** `import { mapItemRecord } from '../lib/tripDetail'` breaks at ESM runtime.
**How to avoid:** `from '../lib/tripDetail.js'` (CLAUDE.md ESM convention). `TripDetailResponse`/`Item` come from `@packpixie/model` (bare specifier, no `.js`).

## Code Examples

### Full handler skeleton (protected block, after `GET /trips`)
```typescript
// In apps/api/src/routes/api.ts, inside protected_ register block [VERIFIED: apps/api/src/routes/api.ts:95-237]
protected_.get<{ Params: { tripId: string } }>(
  '/trips/:tripId',
  async (request, reply): Promise<TripDetailResponse> => {
    const { tripId } = request.params;
    const callerEmail = request.user.email.trim().toLowerCase();

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: conf.dynamoDBTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `TRIP#${tripId}` }, // parameterized (D-10)
      }),
    );
    const records = result.Items ?? [];

    // GUARD (D-02): single predicate, byte-identical 404 for both failure modes (D-03)
    if (!records.some((r) => (r.SK as string) === `USER#${callerEmail}`)) {
      return reply.status(404).send({ error: 'Trip not found' }) as never;
    }

    const meta = records.find((r) => (r.SK as string).startsWith('META#'));
    const participants = records
      .filter((r) => (r.SK as string).startsWith('USER#'))
      .map((r) => r.Email as string)
      .filter(Boolean);
    const items = records
      .filter((r) => (r.SK as string).startsWith('ITEM#'))
      .map(mapItemRecord); // explicit-field mapper (D-04/D-05)

    return {
      tripId,
      tripName: (meta?.TripName as string) ?? '',
      participants,
      items,
    };
  },
);
```
> `mapItemRecord` is the Pattern-3 function. Note `items` will be `[]` this phase (no items written until Phase 7) — that is the correct, expected result.
> Add `TripDetailResponse` (and `Item`, `ItemStatus` if the mapper is inline) to the `@packpixie/model` import at `api.ts:8-14`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `app-architecture.md §5` multi-table schema (`Trips`/`TripMembers`/`TripRows`/`TripDistributionAssignments`, `version` locking, `userId`/`role`/soft-delete) | Single-table design in `dynamoDB-architecture.md` (`PK=TRIP#<id>`, `SK` prefixes `META#`/`USER#`/`ITEM#`) | Pre-Phase-5 (docs never updated) | §5 is fiction relative to code; D-08 marks it superseded rather than editing field-by-field |
| Participant identity documented as `<UserId>` | Lowercased verified JWT **email** (already the implemented storage key) | Implemented in `POST /trips`; docs lag | D-07 corrects the in-scope identity refs; SC #3 |

**Deprecated/outdated:**
- `app-architecture.md §5.1-§5.4` table designs — do not implement; single-table `dynamoDB-architecture.md` is authoritative.
- Optimistic `version` locking / `409` conflict (§5.3) — explicitly out of scope (REQUIREMENTS.md "Out of Scope": last-write-wins acceptable this slice).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none) | — | All claims are verified against source files read this session or copied verbatim from locked CONTEXT decisions. |

**This table is empty:** All claims in this research were verified or cited — no user confirmation needed. The only genuinely forward-looking item (`CreatedAt` populated by Phase 7's writer) is already a locked D-04 decision, not an assumption.

## Open Questions

1. **Should `mapItemRecord` / `shapeTripDetail` live in `apps/api/src/lib/tripDetail.ts` or inline in `api.ts`?**
   - What we know: Phase 7 (writer) and Phase 8 (client rendering, though client-side) will touch the same item shape; the storage-attribute contract is shared.
   - What's unclear: nothing blocking — this is explicit Claude's Discretion.
   - Recommendation: Extract to `apps/api/src/lib/tripDetail.ts` — Phase 7's write path can reuse the field map as a single source of truth, reducing drift risk on the cross-phase D-04 contract.

2. **`tripName` fallback when `META#` is somehow absent but the caller is a member.**
   - What we know: In practice `META#` is always written atomically with the creator `USER#` in the same `TransactWriteCommand` [VERIFIED: apps/api/src/routes/api.ts:118-148], so a member without META is not reachable.
   - What's unclear: whether to defensively coalesce.
   - Recommendation: `?? ''` coalesce (shown in skeleton) keeps the type honest without adding a branch; acceptable and cheap.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + pnpm + Turbo toolchain | build / type-check / lint | ✓ (project runs on it) | pnpm 10.12.1 | — |
| DynamoDB (real or Local) | Runtime read at execution | Not required to *plan/build* — endpoint is exercised at runtime only | — | E2E harness (`apps/e2e`, testcontainers) spins DynamoDB Local, but no new E2E this phase (Phase 10) |

**Missing dependencies with no fallback:** None — this phase is code + docs; it compiles and type-checks with the existing toolchain.
**Missing dependencies with fallback:** Live DynamoDB is only needed to manually exercise the endpoint; not a build/plan blocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None for `apps/api`** — `apps/api` test script is a stub: `"test": "echo \"Error: no test specified\" && exit 1"` [VERIFIED: apps/api/package.json:12]. No vitest/jest config exists anywhere in the repo [VERIFIED: repo-wide find, no results]. |
| E2E framework | Playwright (`@playwright/test` 1.60.0) in `apps/e2e`, DynamoDB Local via `testcontainers` [VERIFIED: apps/e2e/package.json]. **Out of scope this phase** (Phase 10 owns E2E for this endpoint). |
| Config file | `apps/e2e/playwright.config.ts` (e2e only) [VERIFIED: apps/e2e/playwright.config.ts] |
| Quick run command | `pnpm type-check` (per-package `tsc --noEmit`) |
| Full suite command | `pnpm build && pnpm lint && pnpm type-check` |

> **Nyquist reality:** there is no automated unit-test harness for the API, and CONTEXT/roadmap explicitly forbid adding test infra this phase (E2E deferred to Phase 10). The primary automated gates are **type-check + build + lint**; behavioral verification of the security-critical guard is a **documented manual matrix** (below). The planner should NOT introduce vitest/jest here — that would contradict the deferred-scope decision. The guard behaviors listed are flagged as the highest-value coverage for Phase 10.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | Coverage This Phase |
|--------|----------|-----------|-------------------|---------------------|
| TRIP-02 | Non-member (foreign trip) → 404 `{ error: 'Trip not found' }` | manual (Phase 10 E2E) | `pnpm type-check` (compiles) | Manual matrix M1 |
| TRIP-02 | Non-existent trip → **byte-identical** 404 | manual (Phase 10 E2E) | — | Manual matrix M2 (diff M1 vs M2) |
| TRIP-02 | Member → 200 with shaped snapshot | manual (Phase 10 E2E) | — | Manual matrix M3 |
| SC #1 | No `PK`/`SK`/`GSI*` in 200 body | manual + review | `pnpm type-check` (DTO type forbids them) | Manual matrix M3 + code review of explicit-field build |
| SC #1 | Single DynamoDB `Query`, no second read | code review | — | Review: exactly one `dynamoDBClient.send(new QueryCommand(...))` in handler |
| TRIP-03 | Membership/`PackedBy`/default-view key off lowercased `request.user.email` | code review + manual | `pnpm type-check` | Review of `.trim().toLowerCase()`; doc diff for D-07/D-08 |
| SC #3 | Docs corrected `UserId`→email | doc review | `grep` for surviving membership/`PackedBy` `<UserId>` refs | Diff of `dynamoDB-architecture.md` + `app-architecture.md §5/§5.2` |

**Manual verification matrix (planner should encode as explicit UAT steps):**
- **M1 — foreign trip:** authenticated user A requests a trip they are not a `USER#` of → expect `404` and body exactly `{"error":"Trip not found"}`.
- **M2 — non-existent trip:** same user requests a random UUID → expect the **same** status, body, and headers as M1 (capture both responses and diff them — must be identical).
- **M3 — member:** trip creator requests their own trip → expect `200` with `{ tripId, tripName, participants, items }`, `items: []`, and **no** `PK`/`SK`/`GSI1PK`/`GSI1SK` keys anywhere in the payload.
- **M4 — case-insensitivity:** member whose JWT email has uppercase letters → expect `200` (not a false 404), proving the lowercasing guard.

### Sampling Rate
- **Per task commit:** `pnpm type-check` (fast, catches DTO/return-type/import-extension errors).
- **Per wave merge:** `pnpm build && pnpm lint && pnpm type-check`.
- **Phase gate:** full build green + M1-M4 manual matrix executed and recorded before `/gsd-verify-work`.

### Wave 0 Gaps
- None for automated infra — **do not scaffold a unit-test framework** (contradicts deferred scope; Phase 10 owns E2E).
- Planner must include the M1-M4 manual verification matrix as explicit UAT/verification steps, since no automated behavioral test will exist until Phase 10.

## Security Domain

**`security_enforcement: true`, ASVS Level 1** [VERIFIED: .planning/config.json:46-47]. This is the security-critical phase of the milestone — the guard is the whole point.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Cognito JWT verified by `authPlugin` (`aws-jwt-verify`) before the handler runs; identity from `id` token `email` claim [VERIFIED: apps/api/src/plugins/auth.ts:17-45] |
| V3 Session Management | no | Stateless bearer tokens; no server session |
| V4 Access Control | **yes (core)** | Server-side per-request participation guard keyed off verified JWT email (D-02); IDOR-resistant — object access requires membership, not just knowing the `tripId` |
| V5 Input Validation | yes (low risk) | `tripId` used only as a parameterized `ExpressionAttributeValue` — no NoSQL injection surface (D-10); no other user input in the read path |
| V6 Cryptography | no | No crypto authored this phase |
| V7 Error Handling & Logging | **yes** | Uniform, non-revealing 404 for both failure modes; no stack/internal detail in body (D-03) |
| V8 Data Protection | yes | Response carries only DTO fields — no internal keys leaked (D-05); co-participant emails to members is intended, not a leak |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Trip-existence enumeration by diffing responses | Information Disclosure | 404-not-403 + one byte-identical `{ error: 'Trip not found' }` for foreign *and* non-existent trips; single code branch (D-02/D-03) |
| IDOR — reading a foreign trip by guessing/knowing its `tripId` | Elevation of Privilege | Membership guard on `USER#<callerEmail>`; access is object-scoped, server-enforced, never trusts the path (D-02/D-09) |
| Internal-key leakage (`PK`/`SK`/`GSI*`) exposing schema | Information Disclosure | Explicit field-by-field DTO construction; the type never carries internal keys (D-05) |
| Identity spoofing via body/param `email` or `userId` | Spoofing | Identity taken **only** from `request.user.email` (verified JWT); path/body never consulted for identity (CLAUDE.md, D-09) |
| NoSQL/expression injection via `tripId` | Tampering | Parameterized `ExpressionAttributeValue`, never string-concatenated into the key expression (D-10) |
| Case-mismatch auth bypass/false-deny | (Access Control correctness) | Normalize `request.user.email.trim().toLowerCase()` to match lowercased stored `USER#` keys |

**Security verification for `/gsd-secure-phase`:** confirm (1) M1≡M2 byte-identical 404, (2) no 403 path exists, (3) exactly one `QueryCommand`, (4) response built by explicit assignment with no spread of DB records, (5) `grep` shows no surviving membership/`PackedBy` `<UserId>` doc reference.

## Sources

### Primary (HIGH confidence — read this session)
- `apps/api/src/routes/api.ts` (lines 8-14, 95-237) — existing `GET /trips`/`POST /trips` patterns, `{ error }` reply convention, email-lowercasing writes, protected register block.
- `apps/api/src/plugins/auth.ts` (1-46) — `request.user.email` origin, `AuthUser` shape, `reply.unauthorized`.
- `apps/api/src/lib/dynamodb.ts` (1-32) — shared `DynamoDBDocumentClient` marshalling options.
- `packages/model/src/item.ts` (1-20) — `Item`, `ItemStatus`, `TripDetailResponse` DTOs.
- `apps/api/package.json`, root `package.json`, `apps/e2e/package.json`, `apps/e2e/playwright.config.ts` — dependency versions, test-script reality.
- `dynamoDB-architecture.md` (§1-§5) and `app-architecture.md` (§1, §5) — correction targets for SC #3.
- `.planning/config.json` — `security_enforcement`, ASVS level, `nyquist_validation`.
- `.planning/phases/06-.../06-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — locked decisions, requirement text, project history.

### Secondary (MEDIUM confidence)
- None — no external lookups needed; the phase is fully specified in-repo.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from `apps/api/package.json`; no new packages.
- Architecture: HIGH — new handler is a verified variant of the existing `GET /trips` handler; decisions locked in CONTEXT.
- Pitfalls: HIGH — reserved words, `sensible` body shape, `as never` cast, email casing all grounded in read source.
- Validation: HIGH — confirmed no API unit-test framework exists; E2E deferred to Phase 10.
- Security: HIGH — threat model derived directly from the locked enumeration-resistance contract (D-02/D-03/D-05).

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 (stable — internal code/docs, no fast-moving external deps)
