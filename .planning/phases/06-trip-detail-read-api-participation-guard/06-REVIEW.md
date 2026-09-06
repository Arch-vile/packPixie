---
phase: 06-trip-detail-read-api-participation-guard
reviewed: 2026-08-13T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - apps/api/src/routes/api.ts
  - apps/api/src/lib/tripDetail.ts
  - dynamoDB-architecture.md
  - app-architecture.md
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-08-13
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the new `GET /trips/:tripId` read endpoint and its `mapItemRecord` DTO
helper against the four contracts called out for this phase.

Three of the four contracts hold up under adversarial reading:

- **Identity source** — `callerEmail` is derived solely from
  `request.user.email` (verified JWT), never the path param or body. The path
  `tripId` is used only to scope the partition query. Correct.
- **No expression injection** — the query uses a fixed
  `KeyConditionExpression: 'PK = :pk'` with `tripId` bound as a *value* in
  `ExpressionAttributeValues`, not concatenated into the expression string.
  DynamoDB treats it as opaque data. No injection surface. Correct.
- **DTO leakage** — `mapItemRecord` copies only explicit public fields via
  conditional assignment (no spread); `participants`/`tripName`/`tripId` are
  read from named attributes. No `PK`/`SK`/`GSI1PK`/`GSI1SK` reaches the wire.
  Correct.

The **enumeration-resistance invariant is correct at the response layer**
(both foreign and non-existent trips fall through the single `!isMember` branch
to a byte-identical `404 {"error":"Trip not found"}`; no 403 path exists).
However, the guard has a **latent correctness defect from missing DynamoDB
Query pagination** (CR-01) that can flip a legitimate member to a false 404 and
return truncated data once a trip partition exceeds one page — a functional
break of the security-critical guard, so it is a BLOCKER.

The two `.md` edits are documentation-only identity corrections and are
accurate, with one leftover inconsistency (IN-02).

## Critical Issues

### CR-01: Missing Query pagination silently breaks the participation guard for large trips

**File:** `apps/api/src/routes/api.ts:248-266`
**Issue:**
The handler issues a single `QueryCommand` for `PK = TRIP#<tripId>` and then
reads only `result.Items ?? []`. It never loops on `LastEvaluatedKey`. A
DynamoDB Query returns at most 1 MB per invocation and paginates the rest.

This is not a performance nit — it corrupts the security-critical guard, because
of the sort-key ordering within the partition. Items are returned in ascending
`SK` order by default, and the three entity prefixes sort as:

```
ITEM#...   (ASCII 'I' = 73)   <-- returned first
META#...   (ASCII 'M' = 77)
USER#...   (ASCII 'U' = 85)   <-- returned LAST
```

The `USER#` participant records — the exact records `isMember` depends on —
sort *last*, so they are the *first* thing dropped when a partition overflows
one page. A trip with enough `ITEM#` records (Phase 7 write path) to fill 1 MB
will push the caller's own `USER#<email>` record onto an unfetched second page.
`records.some(...)` then returns `false` and a **legitimate member is denied
their own trip with a spurious 404**. The same truncation makes `meta`
(sorts between ITEM# and USER#) resolve to `undefined` (empty `tripName`) and
returns an incomplete `participants`/`items` set even on the success path.

Note the query here fetches full item records with no `ProjectionExpression`
(unlike the participant sub-query in `GET /trips`), so the 1 MB ceiling is
reached far sooner.

**Fix:** Drain all pages before evaluating the guard so the guard sees the
complete partition:

```ts
const records: Record<string, unknown>[] = [];
let ExclusiveStartKey: Record<string, unknown> | undefined;
do {
  const page = await dynamoDBClient.send(
    new QueryCommand({
      TableName: conf.dynamoDBTable,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `TRIP#${tripId}` },
      ExclusiveStartKey,
    }),
  );
  records.push(...(page.Items ?? []));
  ExclusiveStartKey = page.LastEvaluatedKey;
} while (ExclusiveStartKey);
```

(The same latent gap exists in the pre-existing `GET /trips` participant
sub-query at lines 211-220; worth fixing there too for consistency, but out of
this phase's changed scope.)

## Warnings

### WR-01: `mapItemRecord` casts required attributes without validation, shipping `undefined` typed as `string`/`number`/`boolean`

**File:** `apps/api/src/lib/tripDetail.ts:14-19`
**Issue:**
`itemId`, `createdAt`, `name`, `quantity`, and `consumable` are produced with
unchecked `as` casts (`r.Name as string`, `r.Qty as number`,
`r.Consumable as boolean`). If any `ITEM#` record is missing one of these
attributes (e.g. a write-path defect in the upcoming Phase 7, or a partial
write), the function returns a DTO whose required field is `undefined` while
the type system claims it is present. This violates the `Item` contract
silently rather than failing fast, and `(r.SK as string).replace(...)` would
throw a `TypeError` (500) if `SK` were ever absent. Because no `ITEM#` writer
exists yet, this is latent, but it is the mapping the Phase 7 contract will lean
on.

**Fix:** Validate the required attributes and reject malformed records
explicitly, e.g.:

```ts
if (
  typeof r.SK !== 'string' ||
  typeof r.Name !== 'string' ||
  typeof r.Qty !== 'number' ||
  typeof r.Consumable !== 'boolean' ||
  typeof r.CreatedAt !== 'string'
) {
  throw new Error(`Malformed ITEM record: ${String(r.SK)}`);
}
```

or narrow via a schema guard before mapping.

### WR-02: `request.user.email` assumed always present; `.trim()` throws 500 on an email-less token

**File:** `apps/api/src/routes/api.ts:246`
**Issue:**
`request.user.email.trim().toLowerCase()` assumes `email` is a non-null string.
In `plugins/auth.ts:38` it is populated via `payload.email as string`, but the
`email` claim is not guaranteed to exist on a Cognito ID token (it depends on
IdP attribute mapping / scopes). A verified token lacking the claim yields
`request.user.email === undefined`, and `.trim()` throws → Fastify 500. This is
a shared pattern across `POST /trips` and `GET /trips`, but it is present in the
new handler too. A 500 here is a crash on otherwise-valid auth, not just an
enumeration concern.

**Fix:** Guard the claim once in the auth plugin (reject the token with 401 if
`email` is absent) so all downstream handlers can rely on it:

```ts
if (typeof payload.email !== 'string' || !payload.email) {
  return reply.unauthorized('Token missing required email claim');
}
request.user = { sub: payload.sub, email: payload.email };
```

## Info

### IN-01: Duplicated participant-extraction logic across two handlers

**File:** `apps/api/src/routes/api.ts:222-225` and `276-279`
**Issue:** The `filter(SK startsWith 'USER#') → map(Email) → filter(Boolean)`
sequence is duplicated verbatim in `GET /trips` and `GET /trips/:tripId`. Drift
between the two copies could later cause inconsistent participant lists.
**Fix:** Extract a small helper (e.g. `extractParticipants(records)`) next to
`mapItemRecord` in `lib/tripDetail.ts` and use it in both places.

### IN-02: `dynamoDB-architecture.md` `Carried` map still references `<UserId>` after the email-identity correction

**File:** `dynamoDB-architecture.md:33-34`
**Issue:** The phase corrected participant identity to the lowercased JWT email
(SK/GSI1PK/`Email`, and `PackedBy`), but the `Carried` map description still
reads "Map of `<UserId>` to `Number`" with example `{"user_123": 2, ...}`,
contradicting the new identity note directly above it. Same stale `UserId`
example remains in section 4.C ("apply the fallback rules for `PackedBy` and
`UsedBy`"). This is a documentation inconsistency, not a code defect.
**Fix:** Update the `Carried`/`UsedBy` descriptions and the example keys to use
participant emails, consistent with the identity correction.

---

_Reviewed: 2026-08-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
