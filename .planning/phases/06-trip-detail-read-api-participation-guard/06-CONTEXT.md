# Phase 6: Trip-Detail Read API & Participation Guard - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a single protected endpoint `GET /trips/:tripId` to `apps/api` that runs **one** DynamoDB `Query` on `PK = TRIP#<tripId>`, shapes the flat result into the `TripDetailResponse` contract (`{ tripId, tripName, participants, items }`) with **no internal keys** (`PK`/`SK`/`GSI*`) in the response, and enforces an **email-keyed participation guard** that returns **404** (never 403) to any caller whose verified JWT email is not among the trip's `USER#` records — making foreign trips and non-existent trips indistinguishable. Also correct the stale `<UserId>` identity references in the architecture docs to email.

This phase is **API + docs only**. No item writes (Phase 7), no trip-detail UI table (Phase 8), no filters (Phase 9), no new E2E specs (Phase 10). The endpoint reads items via a PascalCase→camelCase mapper even though **no items are written yet** — an empty `items: []` is the normal, correct result this phase.

</domain>

<decisions>
## Implementation Decisions

The user opted not to discuss gray areas and delegated these decisions. They are recorded here as locked so downstream agents act without re-asking; anything genuinely open is under **Claude's Discretion** at the end.

### Participation guard & single-query strategy

- **D-01:** The endpoint issues exactly **one** DynamoDB `Query` with `KeyConditionExpression: PK = :pk`, `:pk = TRIP#<tripId>` — no `IndexName`, no separate guard `GetItem`, no second read. Membership, trip meta, participants, and items are ALL derived from this single result set (partition records by `SK` prefix: `META#` → meta, `USER#` → participants, `ITEM#` → items). This satisfies Success Criterion #1 ("single DynamoDB query") while also serving the guard. — **Reversibility:** reversible — internal handler logic, no stored contract.

- **D-02:** The guard is: normalize the caller identity as `request.user.email.trim().toLowerCase()`, then **404 unless a `USER#<normalizedEmail>` record is present** in the query result. This one predicate covers both failure modes identically: a non-existent trip returns zero records (no matching `USER#`) → 404; a real trip where the caller is not a participant returns records but no `USER#<callerEmail>` → 404. Non-members can never distinguish "trip doesn't exist" from "you're not on it." Presence of a `META#` record is **not** sufficient for access — membership is the sole gate. — **Reversibility:** costly — this is the security contract (enumeration-resistance); changing it later is a security-relevant change requiring re-review.

### 404 response shape

- **D-03:** The 404 uses the existing error convention already in `routes/api.ts`: `reply.status(404).send({ error: 'Trip not found' })`. **One identical message** for both the foreign-trip and non-existent-trip cases — the response body, status, and headers must be byte-identical so nothing (message, timing-insensitive shape) leaks which case occurred. No `403` is ever returned from this endpoint for a membership failure. — **Reversibility:** reversible.

### Item attribute mapping (storage → DTO)

- **D-04:** A dedicated mapping function translates each stored `ITEM#` record (PascalCase storage attributes) to the camelCase `Item` DTO from `@packpixie/model`. The storage→DTO field map, per `dynamoDB-architecture.md` §2–§3 and Phase 5 D-01/D-02:
  - `itemId` ← strip the `ITEM#` prefix from `SK`
  - `name` ← `Name`
  - `quantity` ← `Qty` (number)
  - `consumable` ← `Consumable` (boolean)
  - `weight` ← `Weight` (omit key when the attribute is absent)
  - `packedBy` ← `PackedBy` (omit when absent; a lowercased participant email when set, per Phase 5 D-05)
  - `status` ← `Status` (omit when absent; one of `to-buy`/`found`/`packed`)
  - `category` ← `Category` (omit when absent)
  - `createdAt` ← `CreatedAt` (Phase 7 populates this on write; the mapper reads it forward-compatibly)
  This defines the storage-attribute contract Phase 7's writer MUST match. Absent optional attributes become **absent DTO keys**, never `null`/`""`/`0` (mirrors Phase 5 D-04 and the `attribute_exists` semantics Phase 7 relies on). — **Reversibility:** costly — the storage attribute names become a cross-phase contract shared with the Phase 7 write path.

- **D-05:** The response is **constructed by explicit field assignment** (build the DTO object field-by-field), never by spreading or returning raw DynamoDB items. This is how `PK`/`SK`/`GSI1PK`/`GSI1SK` are guaranteed absent from the response (Success Criterion #1) — the type simply never carries them and the mapper never copies them. — **Reversibility:** reversible.

- **D-06:** `participants` is built from the `USER#` records' `Email` attribute (reusing the exact pattern already in `GET /trips`: filter `SK` starts-with `USER#`, map to `Email`, drop falsy) — an array of participant emails, matching `Trip.participants` and Phase 5 D-06. `tripName` comes from the `META#` record's `TripName`. — **Reversibility:** reversible.

### Doc-correction scope (Success Criterion #3)

- **D-07:** `dynamoDB-architecture.md` is corrected for the **in-scope identity references**: the Participant row `USER#<UserId>` → `USER#<email>` (PK-side SK and both GSI1 columns), the `PackedBy` description ("Stores the `<UserId>`") → stores the **participant email**, and access-pattern B's `GSI1PK = USER#<UserId>` → `USER#<email>`. The `UsedBy`/`Carried` `<UserId>` mentions belong to deferred Distribution features (out of scope, Phase 5 D-08) — leave their bodies but add a one-line note that participant identity everywhere is the lowercased email. — **Reversibility:** reversible — documentation.

- **D-08:** `app-architecture.md §5` describes a **stale multi-table schema** (`Trips`/`TripMembers`/`TripRows`/`TripDistributionAssignments`, `version` optimistic locking, `ownerUserId`/`role`/soft-delete) that does **not** match the actual implemented single-table design. Rather than field-by-field `userId`→email edits inside a fundamentally-wrong section, prepend a short **"superseded" banner** to §5 pointing to `dynamoDB-architecture.md` as authoritative and stating that participant identity is the verified JWT email — and correct §5.2's `userId` identity references to email in passing. Do not attempt to reconcile the rest of the fictional multi-table schema in this phase. — **Reversibility:** reversible — documentation. **This is a judgment call; see Claude's Discretion if the planner prefers a narrower edit.**

### Route placement & input handling

- **D-09:** `GET /trips/:tripId` is registered in the **protected scope** of `apps/api/src/routes/api.ts`, alongside the existing `GET /trips` and `POST /trips` (inside the `protected_` register block that applies `authPlugin`). Identity comes only from `request.user.email` (verified JWT), never from params/body (CLAUDE.md convention). — **Reversibility:** reversible.

- **D-10:** `tripId` is taken from the path param and used **only** as a parameterized `ExpressionAttributeValue` (`:pk = TRIP#<tripId>`) — never string-concatenated into a `KeyConditionExpression`. No strict UUID validation is required: a malformed or unknown `tripId` simply returns zero records → the same 404 path (D-02), which is the correct safe behavior. — **Reversibility:** reversible.

### Claude's Discretion
- Exact file location of the item mapper (inline helper in `routes/api.ts` vs a small `apps/api/src/lib/tripDetail.ts` module the Phase 7/8 code can reuse) — planner's call; a reusable module is the natural fit given Phase 7/8 will touch the same shape.
- Whether the guard/shape logic is one handler function or split into small helpers.
- The exact wording of the D-08 doc banner, and — if the planner judges it cleaner — a narrower correction that edits only §5.2's identity fields instead of adding a superseded banner. Either satisfies SC #3 as long as no stale `<UserId>` identity reference for **membership/PackedBy** survives.
- Whether to add a `@packpixie/model` import touchpoint on the API side now (the endpoint returns `TripDetailResponse`, which naturally imports it).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data model & storage semantics
- `dynamoDB-architecture.md` §2 — the three entity types under one Trip PK (`META#`, `USER#`, `ITEM#`) and their attributes; §3 — item attribute types (`Name`, `Qty`, `Weight`, `PackedBy`, `Status`, `Consumable`, `Category`) and the "omit when unassigned" rule the mapper mirrors; §4.A — the single `Query PK=TRIP#<TripId>` "load entire trip workspace" access pattern this endpoint implements. **This doc is the correction target for SC #3 (D-07).**
- `app-architecture.md` §5 — stale multi-table data model; §5.2 carries the `userId` identity references. **Correction target for SC #3 (D-08); treat §5 as superseded by `dynamoDB-architecture.md`.**
- `app-architecture.md` — auth flow: `request.user` is set with `sub` and `email` from verified JWT claims (grounds D-09).

### Read contract (locked in Phase 5)
- `packages/model/src/item.ts` — the `Item` / `ItemStatus` / `TripDetailResponse` DTO the mapper targets (implement verbatim; do not re-derive field names).
- `.planning/phases/05-shared-item-model-comments-cleanup/05-CONTEXT.md` — D-01 (camelCase DTO / PascalCase storage split), D-02 (Item shape), D-04 (absent = unset), D-05 (`packedBy` is an email), D-06 (`TripDetailResponse` shape, participants are emails).

### Existing code to match
- `apps/api/src/routes/api.ts` — `GET /trips` shows the exact `Query PK=TRIP#<tripId>` + participant-extraction pattern (filter `USER#`, map `Email`) and the protected-route registration + `{ error }` reply convention to reuse.
- `apps/api/src/plugins/auth.ts` — `request.user.email` origin and `AuthUser` shape.
- `apps/api/src/lib/dynamodb.ts` — the shared `DynamoDBDocumentClient` (already `removeUndefinedValues: true`, `wrapNumbers: false`).

### Conventions
- `CLAUDE.md` — identity always from `request.user` (never params/body); public vs protected route split in `routes/api.ts`; `.js` extensions on relative imports in `apps/api`; "leave nothing unused behind."

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GET /trips` handler in `apps/api/src/routes/api.ts` — near-identical query + participant extraction; the new handler is a focused variant that also collects `META#` and `ITEM#` records and adds the membership gate.
- `DynamoDBDocumentClient` from `lib/dynamodb.ts` is already injected into `apiRoutes(conf, dynamoDBClient)` — the new route uses the same client, no new wiring.
- `TripDetailResponse` from `@packpixie/model` is the return type; `Item` is the mapper target.

### Established Patterns
- Protected routes live inside the `protected_.register(authPlugin(conf))` block; the new `GET /trips/:tripId` goes there.
- Participant emails are stored lowercased (`POST /trips` lowercases `creatorEmail` and invited emails) — the guard MUST compare with a lowercased caller email to match.
- Error responses use `reply.status(N).send({ error: '...' })`.

### Integration Points
- `apps/api/src/routes/api.ts` — the only code file that must change (add one route + mapper). Optionally a new `apps/api/src/lib/tripDetail.ts` mapper module (Claude's Discretion).
- `dynamoDB-architecture.md` and `app-architecture.md` — the two docs corrected for SC #3.
- No client changes this phase (trip-detail UI is Phase 8).

### Security-sensitive notes (for the planner's threat model)
- Enumeration resistance is the core security property: 404-not-403 + one identical response for foreign/missing trips (D-02, D-03).
- Authorization (membership) is enforced server-side from the verified JWT email only — never trust the path/body.
- No internal keys (`PK`/`SK`/`GSI*`) may appear in the response (D-05).
- The query returns co-participants' emails to members — this is intended (matches `GET /trips`), not a leak.

</code_context>

<specifics>
## Specific Ideas

- Implement the `TripDetailResponse` mapping exactly as the Phase 5 contract specifies (`item.ts`), including absent-key semantics for `weight`/`packedBy`/`status`/`category`.
- The storage-attribute names in D-04 (`Name`/`Qty`/`Weight`/`PackedBy`/`Status`/`Consumable`/`Category`, SK `ITEM#<id>`, `CreatedAt`) are the contract Phase 7's write path must honor — surface this as a cross-phase truth.

</specifics>

<deferred>
## Deferred Ideas

- **Item writes** (create/edit/delete, `PackedBy`-is-a-member validation, `packed` requires `PackedBy`, clearing `PackedBy` resets `Status`, item id/sort/`createdAt` population) → Phase 7 (ITEM-04/05/06).
- **Trip-detail UI table** and the client fetch of this endpoint → Phase 8 (TRIP-01, ITEM-01/02/03).
- **`PackedBy = me` default view, status filter, show-all toggle** → Phase 9 (VIEW-01/02/03) — client-side over the single fetched snapshot.
- **E2E coverage of the read endpoint + participation guard** → Phase 10 (E2E-01/02). No new Playwright specs or test infra this phase, per roadmap. (The guard is the highest-value thing Phase 10 must cover — flagged for that phase.)
- **`UsedBy` / `Carried` / Distribution identity** → v2.x milestone (out of typed contract, Phase 5 D-08); their `<UserId>` doc mentions are left in place with only an identity-is-email note (D-07).

None of the above are in Phase 6 scope — the boundary is the read endpoint, the guard, and the doc correction.

</deferred>

---

*Phase: 6-Trip-Detail Read API & Participation Guard*
*Context gathered: 2026-08-12*
