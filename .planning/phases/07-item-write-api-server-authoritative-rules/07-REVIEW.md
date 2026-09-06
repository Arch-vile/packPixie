---
phase: 07-item-write-api-server-authoritative-rules
reviewed: 2026-09-04T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/api/package.json
  - apps/api/src/lib/tripDetail.test.ts
  - apps/api/src/lib/tripDetail.ts
  - apps/api/src/routes/api.ts
  - packages/model/src/item.ts
findings:
  critical: 5
  warning: 2
  info: 3
  total: 10
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-09-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 7 item write-path implementation (`tripDetail.ts` validation core, its test suite, the Fastify route handlers in `api.ts`, and the `@packpixie/model` item types). The overall structure — pure, testable validation helpers feeding thin route handlers — is sound, and the participation/enumeration-resistance pattern for trip access is correctly applied consistently across all four item endpoints.

However, tracing the write-path logic against adversarial inputs surfaced five Critical-tier issues: (1) a deterministic, single-request logic bug where clearing `packedBy` silently deletes a valid non-`packed` `status` (data loss, no concurrency required to reproduce); (2) several unguarded `.trim()` calls on user-supplied fields (`name`, `packedBy`, `tripName`) that crash the handler with an unhandled `TypeError` when a client sends a syntactically valid JSON body with the wrong type (or `null`); (3) a TOCTOU race on item deletion that fully bypasses the "cannot delete a packed item" invariant because the `DeleteCommand` carries no `ConditionExpression`; (4) a TOCTOU race between concurrent PATCH requests that can leave an item persisted as `Status: packed` with no `PackedBy`, because the invariant is checked against a stale, request-scoped `Query` snapshot rather than enforced atomically at write time; and (5) unhandled DynamoDB `ValidationException` crash on `POST /trips` when `participantEmails` contains duplicates, because the batch-write payload is never de-duplicated.

None of these are caught by the existing test suite (`tripDetail.test.ts`), which only exercises the "happy path" combinations of each helper in isolation, not the cross-field interactions or the route-level (untyped, unschema'd) request bodies.

## Critical Issues

### CR-01: Clearing `packedBy` silently deletes a valid, unrelated `status`

**File:** `apps/api/src/lib/tripDetail.ts:274-278` and `apps/api/src/lib/tripDetail.ts:330-336`
**Issue:** `computeItemPatch` computes `resultingStatus = packedByCleared ? undefined : current.Status` whenever the request body omits `status`. This unconditionally clears `Status` when `packedBy` is cleared, **regardless of what the current status actually is**. The only invariant that needs enforcing is "`packed` requires `packedBy`" — there is nothing that requires clearing `packedBy` to also clear a `found` or `to-buy` status.

This is fully reproducible without any concurrency:
1. `POST /trips/:tripId/items` with `{ "name": "Lantern", "status": "found", "packedBy": "a@b.com" }` — this is accepted (`validateStatusRequiresPackedBy` only rejects `packed` without `packedBy`), producing a stored item with `Status: found`, `PackedBy: a@b.com`.
2. `PATCH .../items/:itemId` with `{ "packedBy": null }` only.
3. `computeItemPatch` sets `packedByCleared = true`, then forces `resultingStatus = undefined` even though `current.Status === 'found'`, and the final block (`'status' in body || packedByCleared`) pushes `Status` into `removeAttrs`.
4. Result: the item's `found` status is silently destroyed by a request that only asked to clear `packedBy`.

The only test covering this path (`tripDetail.test.ts:210-222`) uses `current.Status === 'packed'`, which is exactly the one case where this behavior happens to be correct — masking the bug for every other status value.

**Fix:**
```ts
// Only force-clear Status when the current status actually required packedBy.
const statusNeedsClearing = packedByCleared && current.Status === 'packed';

let resultingStatus: ItemStatus | undefined;
if ('status' in body) {
  // ...unchanged...
} else {
  resultingStatus = statusNeedsClearing
    ? undefined
    : (current.Status as ItemStatus | undefined);
}

// ...

if ('status' in body || statusNeedsClearing) {
  if (resultingStatus === undefined) {
    removeAttrs.push('Status');
  } else {
    setAttrs.Status = resultingStatus;
  }
}
```

---

### CR-02: Unvalidated field types crash the handler with an unhandled `TypeError`

**File:**
- `apps/api/src/lib/tripDetail.ts:131` (`const trimmedName = body.name?.trim();`)
- `apps/api/src/lib/tripDetail.ts:180` (`const trimmed = body.packedBy.trim();` — no optional chaining at all)
- `apps/api/src/lib/tripDetail.ts:244` (`const trimmed = (body.packedBy as string)?.trim();`)
- `apps/api/src/lib/tripDetail.ts:292` (`const trimmed = (body.name as string)?.trim();`)
- `apps/api/src/routes/api.ts:122` (`if (!tripName?.trim()) {`)

**Issue:** None of the routes register a Fastify `schema.body`, so the `CreateItemRequest`/`PatchItemRequest`/`CreateTripRequest` TypeScript types provide **no runtime protection** — `request.body` is whatever JSON the client sent. `name`, `packedBy`, and `tripName` are all validated only via optional chaining before `.trim()`, but `?.` only guards against the value itself being `null`/`undefined` — it does not guard against the value being present but of the wrong type (e.g. a number, object, or array), and in the `buildCreateItemAttributes` `packedBy` case (line 180) there isn't even an optional-chaining guard, so `null` crashes immediately.

Reproducible with syntactically valid JSON:
- `POST /trips/:tripId/items` with `{"name": "Tent", "packedBy": null}` → `body.packedBy !== undefined` is `true` (null !== undefined), then `null.trim()` throws `TypeError: Cannot read properties of null (reading 'trim')`.
- `POST /trips/:tripId/items` with `{"name": 123}` → `(123).trim` is `undefined`; the call throws `TypeError: body.name.trim is not a function`.
- `POST /trips` with `{"tripName": 123}` → same failure mode at `api.ts:122`.

Every numeric/boolean/status field (`quantity`, `weight`, `consumable`, `status`, and `category` in the patch path) is properly type-checked with `typeof`; only the string fields (`name`, `packedBy`, and route-level `tripName`) lack this guard. This turns malformed client input into an unhandled 500 instead of the intended clean 400 that this validation layer exists to produce.

**Fix:** Add explicit `typeof` guards before calling `.trim()`, e.g.:
```ts
if (body.name !== undefined && body.name !== null && typeof body.name !== 'string') {
  return { ok: false, error: 'name must be a string' };
}
const trimmedName = body.name?.trim();
```
Apply the same pattern to `packedBy` in both `buildCreateItemAttributes` and `computeItemPatch`, and to `tripName` in `api.ts`. As defense-in-depth, also consider registering a Fastify `schema.body` (ajv) per route so malformed types are rejected before reaching handler code at all.

---

### CR-03: `DELETE` has no atomic guard — a concurrent status change to `packed` bypasses the "cannot delete a packed item" invariant

**File:** `apps/api/src/routes/api.ts:459-511` (the `DeleteCommand` at `api.ts:499-507`); `apps/api/src/lib/tripDetail.ts:392-399` (`assertItemDeletable`)
**Issue:** The DELETE handler reads the item via a `QueryCommand`, calls `assertItemDeletable(itemRecord)` against that snapshot, and only if that check passes issues a `DeleteCommand`. The `DeleteCommand` itself carries **no `ConditionExpression`** — not even an existence check. If another request (e.g. a concurrent `PATCH` marking the item `packed`) commits between the initial `Query` and this `DeleteCommand`, the delete proceeds unconditionally and the packed item is deleted anyway, completely bypassing the invariant `assertItemDeletable` exists to enforce. This is a realistic scenario for a multi-participant packing-list app (two devices/tabs open on the same trip), not just an adversarial one.

**Fix:** Enforce the invariant atomically in the same DynamoDB call:
```ts
try {
  await dynamoDBClient.send(
    new DeleteCommand({
      TableName: conf.dynamoDBTable,
      Key: { PK: `TRIP#${tripId}`, SK: `ITEM#${itemId}` },
      ConditionExpression:
        'attribute_exists(PK) AND (attribute_not_exists(#status) OR #status <> :packed)',
      ExpressionAttributeNames: { '#status': 'Status' },
      ExpressionAttributeValues: { ':packed': 'packed' },
    }),
  );
} catch (error) {
  if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
    return reply
      .status(409)
      .send({ error: 'Item was modified or is packed — refresh and retry' }) as never;
  }
  throw error;
}
```

---

### CR-04: `packed` requires `packedBy` is enforced against a stale read, not atomically — concurrent PATCH requests can persist an invalid state

**File:** `apps/api/src/routes/api.ts:373-456`; `apps/api/src/lib/tripDetail.ts:223-350` (`computeItemPatch`)
**Issue:** `computeItemPatch`'s "packed requires packedBy" check is computed entirely from the `itemRecord` obtained by the handler's own `QueryCommand` earlier in the same request — it is never re-verified by the `UpdateCommand`, whose only `ConditionExpression` is `attribute_exists(PK)`. Concretely:

1. Request A reads current `{ PackedBy: 'a@b.com' }` (no `Status`) and sends `PATCH { packedBy: null }`. Computed: `removeAttrs = ['PackedBy', 'Status']`.
2. Request B, racing against A, reads the *same* stale current `{ PackedBy: 'a@b.com' }` and sends `PATCH { status: 'packed' }` (not touching `packedBy`). Because `'packedBy' in body` is `false`, `resultingPackedBy` falls back to `current.PackedBy` (`'a@b.com'`, from B's stale read) and `validateStatusRequiresPackedBy('packed', 'a@b.com')` passes. B's `setAttrs` is `{ Status: 'packed' }` — it never touches the `PackedBy` attribute since `'packedBy' not in body`.
3. If A's `UpdateCommand` commits first (removing `PackedBy`) and B's commits second (setting `Status: packed`), the final persisted item has `Status: packed` with **no `PackedBy`** — exactly the state the write path is supposed to make unreachable.

**Fix:** Make the invariant part of the atomic write rather than a pre-check. E.g., when `setAttrs.Status === 'packed'` and the request body did not itself supply `packedBy` in this update, add a condition requiring `attribute_exists(PackedBy)` (or, more robustly, adopt optimistic concurrency — a version/`UpdatedAt` attribute checked and incremented on every write — so any interleaved write fails the condition and can be retried/reported as a 409).

---

### CR-05: Duplicate `participantEmails` crash `POST /trips` via a DynamoDB `BatchWriteCommand` duplicate-key error

**File:** `apps/api/src/routes/api.ts:168-193`
**Issue:** `validEmails` is built with `.map(...).filter(...)` but never de-duplicated:
```ts
const validEmails = (participantEmails ?? [])
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0 && e !== creatorEmail);
```
If the client submits `participantEmails: ["a@b.com", "a@b.com"]` (or any two entries that normalize to the same email), the same `PK`/`SK` pair appears twice in one `BatchWriteCommand` chunk. DynamoDB's `BatchWriteItem` rejects batches containing duplicate keys with a `ValidationException`, which is unhandled here and propagates as an unhandled 500, aborting trip creation (the trip META + creator have already been committed via the preceding `TransactWriteCommand`, so this also leaves the trip in a partially-created state with no invited participants).

**Fix:**
```ts
const validEmails = [
  ...new Set(
    (participantEmails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e !== creatorEmail),
  ),
];
```

## Warnings

### WR-01: `category` is not type-validated on the create path (inconsistent with the patch path)

**File:** `apps/api/src/lib/tripDetail.ts:213`
**Issue:** `buildCreateItemAttributes` writes `Category: body.category` directly with only an `undefined` check:
```ts
...(body.category !== undefined && { Category: body.category }),
```
`computeItemPatch`, by contrast, explicitly checks `typeof body.category !== 'string'` (`tripDetail.ts:342-345`) and rejects non-strings. Because there is no route schema (see CR-02), a client can `POST` an item with `category: { "nested": "object" }` or `category: 42` and have it persisted as-is, which will break any downstream code that assumes `Item.category: string`.
**Fix:** Mirror the patch-path check in `buildCreateItemAttributes`:
```ts
if (body.category !== undefined && typeof body.category !== 'string') {
  return { ok: false, error: 'category must be a string' };
}
```

### WR-02: No request-body schema validation registered on any route

**File:** `apps/api/src/routes/api.ts` (all `protected_.post/patch` route registrations, e.g. `api.ts:116`, `308`, `364`)
**Issue:** None of the routes pass a Fastify `schema` option, so all runtime input validation depends entirely on hand-written checks in `tripDetail.ts` and inline route code. As shown by CR-02, that hand-written coverage has gaps. Relying solely on ad hoc `typeof`/optional-chaining checks scattered across helper functions is fragile and easy to regress as new fields are added.
**Fix:** Add a JSON schema (`schema: { body: { type: 'object', properties: {...}, additionalProperties: false } }`) to each write route as a first line of defense, in addition to (not instead of) the business-rule checks in `tripDetail.ts`.

## Info

### IN-01: Redundant `.trim()` call

**File:** `apps/api/src/lib/tripDetail.ts:210`
**Issue:** `PackedBy: packedBy.trim().toLowerCase()` re-trims a value (`packedBy`) that was already trimmed at line 180 (`const trimmed = body.packedBy.trim(); ... packedBy = trimmed;`). Harmless but confusing to read.
**Fix:** Drop the redundant `.trim()`: `PackedBy: packedBy.toLowerCase()`.

### IN-02: `findUnknownFields` only surfaces the first invalid field

**File:** `apps/api/src/lib/tripDetail.ts:48-52` and its callers (`tripDetail.ts:138`, `230`)
**Issue:** `Unknown field: ${unknownFields[0]}` discards every other unrecognized field, requiring clients to fix-and-resubmit repeatedly to discover all problems in a request.
**Fix:** Return all offending field names, e.g. `Unknown fields: ${unknownFields.join(', ')}`.

### IN-03: Error message casing doesn't match the public API field name

**File:** `apps/api/src/lib/tripDetail.ts:63` (`'packed requires PackedBy to be set'`)
**Issue:** The public request field is `packedBy` (camelCase), but the client-facing error string references `PackedBy` (the internal DynamoDB attribute name). This is a minor but avoidable point of confusion for API consumers who only know the `packedBy` field name.
**Fix:** `'packed requires packedBy to be set'`.

---

_Reviewed: 2026-09-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
