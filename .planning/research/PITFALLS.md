# Pitfalls Research

**Domain:** Shared, editable item table on a DynamoDB single-table backend with JWT-scoped multi-participant access (adding to an existing Fastify 5 + DynamoDB single-table + React 19/Vite + Cognito + Playwright app)
**Researched:** 2026-08-11
**Confidence:** HIGH (findings grounded in the actual repository code; phase labels are topical, since the ROADMAP is generated downstream from this research)

> Scope note: These pitfalls are specific to THIS codebase and this milestone (v2.0 Packing Table MVP). They were derived by reading the live schema (`dynamoDB-architecture.md`), the auth plugin (`apps/api/src/plugins/auth.ts`), the existing routes (`apps/api/src/routes/api.ts`), the client mutation pattern (`apps/client/src/TripList.tsx`, `apps/client/src/api/api.ts`), and the E2E harness (`apps/e2e/`). Deferred features (UsedBy/Distribution/Summary/copy-trip/polling `changes?since`) are explicitly out of scope and are only referenced where they constrain a decision made now.

---

## The single most important thing to get right

**Identity in this app is the lowercased EMAIL, not the Cognito `sub`.** Participants are stored as `SK = USER#<email>` with `GSI1PK = USER#<email>` (see `apps/api/src/routes/api.ts` trip-create, and the `/trips` query). `request.user` carries BOTH `sub` and `email`. The architecture docs (`dynamoDB-architecture.md` §2/§3, `app-architecture.md` §5.2) describe participants and `PackedBy` in terms of `<UserId>` — **this is stale relative to the implemented code, which uses email.** Every new decision (participation check, `PackedBy` default, `PackedBy = me` filter, state rules) must key off `request.user.email` (trimmed + lowercased), consistently. Mixing `sub` and `email` will silently break participation checks and the default "my items" view without throwing an error. This underlies Critical Pitfalls 1 and 2.

---

## Critical Pitfalls

### Pitfall 1: Item routes trust `tripId` from the URL without verifying participation (IDOR/BOLA)

**What goes wrong:**
The new item endpoints (`GET/POST/PATCH/DELETE /api/trips/:tripId/items/...`) take `tripId` from the path. Any authenticated Cognito user can call them with *any* `tripId` and read or mutate items of a trip they were never invited to. Today this class of bug does not exist because the only trip-scoped read, `GET /api/trips`, is inherently safe — it queries `GSI1PK = USER#<caller-email>`, so the caller can only ever see their own membership rows. The moment a route derives the partition from a request-supplied `tripId` instead of from the caller's identity, that safety disappears.

**Why it happens:**
Authentication (valid JWT) is mistaken for authorization (member of *this* trip). The `authPlugin` only proves the token is valid; it says nothing about trip membership. It is easy to assume "the route is behind auth, so it's protected."

**How to avoid:**
Add a single reusable guard that runs before every item handler:
```
GetItem(PK = TRIP#<tripId>, SK = USER#<caller-email-lowercased>)
```
If the item does not exist → the caller is not a participant → return **404** (not 403 — see Pitfall 12). Load participation once per request and reuse it. Never derive membership from anything in the body/query. Enforce it for reads too, not just writes (reading another trip's item list is a data leak of participant emails + gear).

**Warning signs:**
An item handler references `request.params.tripId` before any membership lookup; tests only ever use one trip owned by the test user; no test asserts a 404 for a non-member accessing a foreign `tripId`.

**Phase to address:**
Snapshot/read API phase (introduce the guard) and Item CRUD API phase (apply it to every mutation). This is the highest-priority success criterion of both phases.

---

### Pitfall 2: `PackedBy` / default-me / "my items" filter keyed off `sub` instead of email

**What goes wrong:**
New rows must "default PackedBy to the current user," and the packing view defaults to `PackedBy = me`. If `PackedBy` is set from `request.user.sub` (or the filter compares against `sub`) while participants live under `USER#<email>`, then: the default view shows nothing (no row's `PackedBy` matches the participant identity used elsewhere), assigning to another participant by email can't be validated against membership, and the data becomes internally inconsistent (some rows carry `sub`, some carry email).

**Why it happens:**
Both `sub` and `email` are present on `request.user`, and the stale architecture docs say `PackedBy` stores `<UserId>`. `sub` *feels* like the more "correct" stable identifier.

**How to avoid:**
Standardize on lowercased email as the participant identity for this milestone, matching the existing `USER#<email>` records. Store `PackedBy` as an email. Validate that any `PackedBy` value written is a member of the trip (it must correspond to an existing `USER#<email>` row). Compute the default "my items" filter as `PackedBy === request.user.email` on the server-provided snapshot. Add a short note to `dynamoDB-architecture.md` correcting `<UserId>` → email to stop the stale doc from re-introducing the bug.

**Warning signs:**
`PackedBy: request.user.sub` anywhere; the default packing view is empty for freshly created rows; a row can be assigned to an email that isn't a participant.

**Phase to address:**
Item CRUD API phase (write path + validation) and Packing-view phase (filter). Correct the doc during the read/snapshot phase.

---

### Pitfall 3: Partition query returns mixed entity types; forgetting to filter `ITEM#` leaks META/USER rows

**What goes wrong:**
The snapshot is a single `Query PK = TRIP#<tripId>` that returns META, USER (participant), and ITEM rows in one flat array (by design — `dynamoDB-architecture.md` §4.A). If the handler doesn't split by `SK` prefix, META and participant rows end up in the item list, or the raw participant records (emails, GSI keys) get serialized straight to the client. Conversely, filtering with a `FilterExpression` on `begins_with(SK, ITEM#)` still reads/charges for the whole partition and, worse, would drop the META/participants the page also needs.

**How to avoid:**
Fetch the whole partition in one Query (cheap, correct), then split in application code by `SK` prefix — exactly the pattern already used in `/trips` (`.filter((p) => p.SK.startsWith('USER#'))`). Return a shaped response `{ trip, participants, items }`, mapping each entity to a DTO that omits internal keys (`PK`, `SK`, `GSI1PK`, `GSI1SK`). Do not `FilterExpression` away the non-item rows — you need them.

**Warning signs:**
Client receives objects containing `PK`/`SK`; the item list contains an entry with the trip name and no `Name`; participant emails appear inside the items array.

**Phase to address:**
Snapshot/read API phase.

---

### Pitfall 4: `UpdateItem` silently upserts a non-existent (or foreign) item

**What goes wrong:**
`UpdateItem` with no condition **creates** the item if the key doesn't exist. A `PATCH /items/:itemId` with a typo'd or deleted `itemId` will silently create an orphan row `ITEM#<garbage>` under the trip instead of 404-ing. Combined with a missing participation check, an attacker could even seed rows into another trip.

**How to avoid:**
Every `UpdateItem` (and `DeleteItem` where "must exist" matters) uses `ConditionExpression: attribute_exists(PK)`. On `ConditionalCheckFailedException`, return 404. This also gives you a clean not-found signal for free.

**Warning signs:**
Editing a stale row succeeds instead of returning not-found; phantom items appear in a trip after failed edits.

**Phase to address:**
Item CRUD API phase.

---

### Pitfall 5: Reserved-word and REMOVE-vs-SET mistakes in the update expression

**What goes wrong:**
`Name` and `Status` are DynamoDB reserved words. `UpdateExpression: SET Status = :s` throws `ExpressionAttributeName`-type validation errors. Separately, "clearing PackedBy" must **REMOVE** the attribute, not `SET PackedBy = :null` — the app model treats "unassigned" as *attribute absent* (`dynamoDB-architecture.md` §3: "omit the attribute"). Writing an actual `null` or `""` produces a present-but-empty attribute that breaks the `attribute_exists(PackedBy)` semantics the state rules rely on.

**How to avoid:**
Always use `ExpressionAttributeNames` for `#name`, `#status` (and defensively for all field names). Model unassigned `PackedBy`/`Status` as REMOVE. A mutation that clears PackedBy and resets Status is a single expression combining clauses, e.g. `REMOVE PackedBy, #status`. A mutation that sets status uses `SET #status = :s`. Never store `null`/`""` for these two fields.

**Warning signs:**
`ValidationException: Attribute name is a reserved keyword`; filters using `attribute_exists(PackedBy)` behave oddly; a "cleared" assignment still shows an owner.

**Phase to address:**
Item CRUD API phase.

---

### Pitfall 6: Numeric fields (`Qty`, `Weight`) stored as strings

**What goes wrong:**
`<input type="number">` yields a **string**. If the client forwards `"5"` and the server passes it straight into the DocumentClient, it's stored as a DynamoDB `S`, not `N`. Result: numeric sorts/sums are lexicographic ("10" < "9"), the deferred Summary/weight-total work later breaks, and mixed rows (some `N`, some `S`) are impossible to aggregate. Also risky: negative weights, non-integer quantities, `NaN`, and empty-string weight.

**How to avoid:**
Coerce and validate on the server: `Number(...)`, reject `NaN`, enforce `Qty` as a positive integer and `Weight` as a non-negative number (grams, integer per `app-architecture.md`). Store as real JS numbers so the DocumentClient marshals to `N`. Type the request body in `@packpixie/model` with numeric fields and validate at the boundary — do not trust the client's type. Decide the "weight not set" representation (0 vs REMOVE) and document it.

**Warning signs:**
Item list sorts numbers wrong; `typeof item.Weight === 'string'`; a future total-weight computation returns `NaN` or concatenation.

**Phase to address:**
Item CRUD API phase (add the item DTO + validation to `packages/model`).

---

### Pitfall 7: Whole-item `PutItem` causes lost updates on the shared table

**What goes wrong:**
Two participants edit the *same* row near-simultaneously (A changes Qty, B toggles Status). If each save does a full-object `PutItem`, the second write overwrites the first field with its stale copy — a classic lost update. This is the specific concurrency hazard of a *shared* table where "any participant can edit any row."

**Why it happens:**
`PutItem` of the client's whole row object is the easiest thing to write and matches the create path (`PutCommand` is already imported and used for trips).

**How to avoid:**
Mutations use `UpdateItem` that `SET`s only the changed attributes, never `PutItem` on edit. Field-scoped updates on different attributes commute and won't clobber each other. Two users editing the *same* attribute of the same row is genuinely last-write-wins — which is acceptable for this MVP ("cheap correctness rules"). **Optimistic locking (`version` + `ConditionExpression: version = :expected` → 409) from `app-architecture.md` §5.3/§6.1 is deliberately deferred**; it is NOT required for this slice, but leave `PATCH` semantics field-scoped so a `version` column can be added later without reworking the write path.

**Warning signs:**
The edit handler builds an `Item` with every field and calls `PutCommand`; a user's edit "disappears" after another user saves.

**Phase to address:**
Item CRUD API phase. (Optimistic-locking pitfall itself is a *later*-milestone concern — record it as deferred, not ignored.)

---

### Pitfall 8: State-transition rules enforced only on the client

**What goes wrong:**
Rules — `Status = packed` requires `PackedBy` present; clearing `PackedBy` resets `Status` — if enforced only in React, are trivially bypassed. Any participant's client, a replayed request, a race between two edits, or a future second client can produce `packed` with no owner, corrupting the shared data everyone sees.

**Why it happens:**
It's natural to encode the rule where the UI lives (disable the "packed" control until an owner is set) and assume that's enough. But with shared editing there is no single trusted client.

**How to avoid:**
Enforce on **both**, server authoritative:
- Server: reject `SET #status = packed` unless the resulting item will have `PackedBy` (validate against the incoming change *and* the current stored value — e.g. `ConditionExpression: attribute_exists(PackedBy)` when setting packed, or compute the merged state and 400 if invalid). Clearing `PackedBy` performs `REMOVE PackedBy, #status` atomically in one `UpdateItem` so the two can never diverge.
- Client: mirror the rule for UX (disable/relabel controls, reset the status field when owner is cleared) so users don't hit avoidable 400s.

**Warning signs:**
A row exists with `Status = packed` and no `PackedBy`; the only place the rule appears is a React component; the "clear owner" and "reset status" are two separate API calls (non-atomic).

**Phase to address:**
Item CRUD API phase (server, authoritative) with matching UX in the inline-edit-table phase.

---

### Pitfall 9: React inline-edit table — shared state, remounts, and lost focus

**What goes wrong:**
Common inline-table failures: (a) a single form-state object for all rows so typing in one row bleeds into another; (b) inputs not keyed by a stable `itemId`, so a re-render/refetch remounts inputs and the field loses focus mid-typing; (c) `<input type="number">` bound to a value that can become `NaN`, flipping the input from controlled to uncontrolled (React warning + cursor jumps); (d) stale closures in `onChange`/`onBlur` handlers capturing an old row.

**How to avoid:**
Key each row by `itemId` (`key={item.itemId}`), not array index. Keep per-row edit state in a keyed map or a small row component with local state. Keep numeric inputs as strings in local state, parse only on save, and never bind `value` to `NaN`. Save on blur/Enter (not every keystroke) to reduce churn. Ensure the row's local state re-syncs when the authoritative item changes.

**Warning signs:**
"A component is changing a controlled input to be uncontrolled" warnings; the cursor jumps to a different row while typing; edits in one row mutate a sibling.

**Phase to address:**
Trip-detail inline-edit-table phase.

---

### Pitfall 10: Refetch-whole-snapshot after every edit (stale list + jank)

**What goes wrong:**
The existing mutation pattern is await-mutate → refetch-everything → replace state (`TripList.handleCreate` does `await createTrip(...)` then `await getTrips()`). Copying that to a per-cell item editor means a full trip snapshot round-trip on every save: visible flicker, lost input focus, and latency per keystroke/blur. The opposite failure — pure optimistic update with no reconciliation — leaves the list stale when the server normalizes the value (e.g. clears Status because PackedBy was removed) or when the mutation actually failed.

**How to avoid:**
Optimistically update the single edited row in local state, send the field-scoped `PATCH`, and reconcile with the server's returned row (have the mutation endpoint return the updated item). On error, roll back that row and surface a message. Do not refetch the entire snapshot per edit. Note that without polling (`changes?since` is deferred), other participants' edits won't appear until reload — that's an accepted MVP limitation, not a bug; make it explicit so it isn't "fixed" accidentally.

**Warning signs:**
Every cell edit triggers `GET /trips/:id/snapshot`; the table flashes/reorders after each save; a server-side normalization (status reset) doesn't reflect in the UI.

**Phase to address:**
Trip-detail inline-edit-table phase (wiring), Item CRUD API phase (return the mutated row).

---

### Pitfall 11: Random `ITEM#<uuid>` gives unstable, arbitrary row order

**What goes wrong:**
If item IDs are `ITEM#<randomUUID>` (matching how trips use `randomUUID`), the partition Query returns items sorted by that random SK, so the table order is arbitrary and changes relative to insertion. Users perceive rows "jumping around" across reloads.

**How to avoid:**
Either sort client-side by a stored `CreatedAt` (add it to the item like META/USER rows already have), or make the SK sortable (`ITEM#<ULID>` or `ITEM#<createdAt>#<uuid>`) so `Query` returns creation order naturally. Pick one and be consistent. `CreatedAt` is also useful later for change tracking.

**Warning signs:**
Item order differs between reloads; no deterministic ordering in the snapshot response.

**Phase to address:**
Item CRUD API phase (id/sort decision) — cheap now, painful to retrofit after data exists.

---

### Pitfall 12: 403-vs-404 leaks trip existence (enumeration)

**What goes wrong:**
Returning 403 for "trip exists but you're not a member" and 404 for "no such trip" lets any authenticated user enumerate valid `tripId`s by probing status codes.

**How to avoid:**
Return **404 for both** non-existent and non-member cases on all item and snapshot routes. Don't reveal that a trip exists to non-members.

**Warning signs:**
Handler branches return distinct 403/404 based on membership vs existence.

**Phase to address:**
Snapshot/read API and Item CRUD API phases (consistent error contract).

---

### Pitfall 13: Comments-scaffold removal leaves dangling references

**What goes wrong:**
The milestone requires removing the `Comments` scaffold, but it's threaded through several packages: `GET/POST /api/comments` (`apps/api/src/routes/api.ts`), `apps/client/src/Comments.tsx`, `getComments/postComment` + `TripComment`/`GetCommentsResponse` imports (`apps/client/src/api/api.ts`), and `packages/model/src/comment.ts` (exported from `index.ts`). Deleting only the endpoint leaves imports that break `type-check`/`build`; deleting only the component leaves dead model exports and the `COMMENTS` partition writer.

**How to avoid:**
Remove it as one coherent change across all three packages: route handlers, client component + its API functions + imports, the `comment.ts` model file and its `index.ts` re-export. Per CLAUDE.md "leave nothing unused behind." Run `pnpm type-check` and `pnpm build` after. (No data migration needed — `COMMENTS` is a self-contained partition; just stop writing it.)

**Warning signs:**
`pnpm type-check` fails on missing `TripComment`/`GetCommentsResponse`; `Comments.tsx` still imported in `App.tsx`; `comment.ts` still exported.

**Phase to address:**
A dedicated small cleanup phase (can run in parallel with early backend work since it touches disjoint files).

---

### Pitfall 14: E2E multi-participant coverage impossible with a single Cognito test user

**What goes wrong:**
The whole point of the feature is *shared* editing and the `PackedBy = me` vs "someone else" filter. But the E2E harness authenticates as one real Cognito user (creds from Secrets Manager). Through the UI you can only ever produce edits/assignments as that one identity, so "another participant edited the row" and "row assigned to someone else is hidden by the default view" can't be exercised via clicks alone.

**How to avoid:**
Two complementary tactics: (1) On trip create, pass a second `participantEmails` value so a `USER#<email>` participant row exists, then assert the default `PackedBy = me` filter *excludes* a row assigned to that email and the show-all toggle reveals it. (2) For "another user's edit," seed/mutate an item directly against DynamoDB Local (the E2E package already has a DynamoDB client + table lifecycle in `apps/e2e/src/db/init.ts`) to simulate the second participant, since a second Cognito login is heavier. Decide this deliberately in the E2E phase rather than discovering the gap mid-test.

**Warning signs:**
The E2E plan asserts multi-user behavior but the suite only ever logs in once and never seeds a second identity.

**Phase to address:**
E2E coverage phase (and it constrains the Item CRUD API: expose enough for tests to set `PackedBy` to a specific participant).

---

### Pitfall 15: E2E data isolation + missing `data-testid`s on the item table

**What goes wrong:**
DynamoDB Local table is shared for the whole run and Playwright can run parallel workers; seeding was dropped so tests self-provision via the UI (per PROJECT.md). If item assertions select by global text (e.g. "the row named Tent"), other trips'/tests' rows collide. And inline-edit cells without stable testids force brittle selectors based on row order or column position — which break the moment sort/filter changes (see Pitfall 11).

**How to avoid:**
Scope every assertion to a unique trip: create the trip with a `Date.now()`-unique name (the existing `trip.spec.ts` pattern), navigate into *that* trip, and query within its page/container. Add stable testids on the new UI: `data-testid="item-row-<itemId>"`, `item-name-input`, `item-qty-input`, `item-weight-input`, `item-status-select`, `item-packedby-select`, `item-consumable-toggle`, `add-item-button`, plus a filter/show-all control testid — mirroring the existing `trip-name`/`signed-in-label` convention. Reuse the established `Promise.all([waitForResponse, click])` pattern for each mutation to avoid races. Ensure `/trips/:tripId` deep-links work with the stored `storageState` auth (navigating into the detail page must not bounce to login).

**Warning signs:**
Selectors like `.row:nth-child(2)`; tests flake when run with >1 worker; assertions match rows from a different test's trip.

**Phase to address:**
Trip-detail/inline-edit-table phase (add the testids as you build) and E2E coverage phase (isolation strategy).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Last-write-wins, no `version`/optimistic lock on items | Simpler write path; ships the MVP | Same-attribute concurrent edits silently lost; adding `version` later needs a data backfill + client changes | **Acceptable this milestone** — keep writes field-scoped so a `version` column drops in cleanly later |
| No polling / `changes?since` — reload to see others' edits | No change-feed infra now | Stale shared view between participants; feels non-collaborative | Acceptable for MVP; document as a known limitation so it isn't "bug-fixed" ad hoc |
| Refetch whole snapshot after each edit (copy of TripList pattern) | Trivial to implement | Jank, lost focus, latency, doesn't scale with row count | Never for a per-cell editor — do optimistic single-row update instead |
| Storing `Qty`/`Weight` as strings | "It just works" from the input | Broken sort/sum; blocks deferred Summary; mixed-type rows | Never — coerce + validate at the boundary |
| `ITEM#<randomUUID>` with no `CreatedAt` | Matches trip-id pattern | Arbitrary order; retrofitting order after data exists is painful | Never — add `CreatedAt` or a sortable id now |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Cognito / `request.user` | Using `sub` for item identity while participants are `USER#<email>` | Use lowercased `email` everywhere; validate `PackedBy` ∈ participants |
| DynamoDB DocumentClient | Passing input strings for numbers; `SET Status`/`SET Name` (reserved words); `PutItem` on edit | `Number()`+validate; `ExpressionAttributeNames` `#status`/`#name`; `UpdateItem` field-scoped with `attribute_exists(PK)` |
| DynamoDB single-table Query | `FilterExpression` to drop META/USER, or forgetting to split entity types | Query whole partition, split by `SK` prefix in app code, map to DTOs that strip keys |
| Fastify protected scope | Assuming "behind auth" == authorized for this trip | Explicit participation `GetItem(PK=TRIP#id, SK=USER#email)` guard per request |
| Playwright + DynamoDB Local | Global text selectors; single login for a multi-user feature | Per-trip scoping via unique names; seed a second participant via the E2E DynamoDB client |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-snapshot refetch per keystroke/edit | UI flicker, focus loss, N requests while typing | Optimistic single-row update + reconcile with returned row | Immediately noticeable even at a handful of rows |
| N+1 participant queries (already present in `/trips`) | Extra Query per trip in list view | Fine at MVP scale; watch if trip list grows — batch or denormalize | Dozens+ of trips per user |
| `Query` returning ever-growing item partition to the client | Slower snapshot as items grow | Acceptable for a packing list (bounded, tens–low-hundreds of rows) | Only at implausibly large item counts for this domain |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No participation check on item routes (Pitfall 1) | Any user reads/edits any trip (IDOR/BOLA) — most severe risk in this milestone | Mandatory per-request membership guard; enforce on reads and writes |
| 403 vs 404 divergence (Pitfall 12) | Trip-id enumeration | Return 404 for both not-found and non-member |
| `UpdateItem` upsert (Pitfall 4) | Attacker/typo seeds rows into arbitrary trips | `ConditionExpression: attribute_exists(PK)` |
| Leaking internal keys / participant emails in snapshot (Pitfall 3) | Over-disclosure of `PK/SK/GSI` and member emails to non-shaped responses | Map entities to DTOs; strip key attributes |
| Assigning `PackedBy` to a non-participant email | Data references a stranger; breaks member assumptions | Validate `PackedBy` against existing `USER#<email>` rows |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Default `PackedBy = me` view empty because filter uses wrong identity | User opens trip, sees nothing, thinks it's broken | Compute filter with `email`; verify default view shows the user's own new rows |
| "Packed" allowed with no owner (client-only rule bypassed) | Inconsistent shared data others see | Server-authoritative rule + client UX mirror |
| Rows reorder on every reload (random SK) | Disorienting; hard to find an item | Deterministic order via `CreatedAt`/sortable id |
| Silent stale table (no polling) with no cue | User edits over an outdated view | Accept for MVP but consider a manual refresh affordance / documented limitation |

## "Looks Done But Isn't" Checklist

- [ ] **Item routes:** Often missing the participation guard — verify a non-member gets 404 on GET *and* every mutation of a foreign `tripId`.
- [ ] **PATCH item:** Often missing `attribute_exists(PK)` — verify editing a deleted/bogus `itemId` returns 404 instead of creating a row.
- [ ] **State rules:** Often client-only — verify a raw API call can't set `packed` without `PackedBy`, and that clearing `PackedBy` resets `Status` in one atomic update.
- [ ] **Numbers:** Often stored as strings — verify `Qty`/`Weight` are `N` in DynamoDB and reject negatives/NaN/non-integer Qty.
- [ ] **Snapshot shape:** Often leaks keys — verify the client never receives `PK/SK/GSI1PK/GSI1SK`.
- [ ] **Reserved words:** Verify `Status`/`Name` updates use `ExpressionAttributeNames`.
- [ ] **Comments removal:** Verify `pnpm type-check` + `pnpm build` pass with `comment.ts`, `Comments.tsx`, comment API fns, and the routes all gone.
- [ ] **E2E isolation:** Verify item specs pass with parallel workers (unique trip per test, scoped selectors).
- [ ] **Multi-participant E2E:** Verify the `PackedBy = me` filter is actually tested against a row owned by a *different* participant.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Missing participation check shipped | HIGH | Add guard, audit logs for cross-trip access, treat as security incident; add regression test |
| Numbers stored as strings | MEDIUM | Backfill/convert existing `S`→`N` items; add boundary validation to stop new bad writes |
| `sub`-vs-email identity mismatch in data | MEDIUM | Migrate `PackedBy` values; standardize on email; add validation |
| Orphan items from upsert | LOW–MEDIUM | Query + delete `ITEM#` rows with no valid data; add `attribute_exists(PK)` guard |
| Random-order items annoying users | LOW | Add `CreatedAt`, sort client-side; backfill `CreatedAt` from nothing → accept unordered for legacy rows |

## Pitfall-to-Phase Mapping

Phase labels are topical (ROADMAP is generated from this research). Suggested ordering: **(A) Comments cleanup** (parallelizable) → **(B) Snapshot/read API + participation guard** → **(C) Item CRUD API + state rules** → **(D) Trip-detail inline-edit table** → **(E) Packing-view filters** → **(F) E2E item-table coverage**.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. No participation check (IDOR) | B (guard) + C (writes) | Non-member gets 404 on read + every mutation |
| 2. sub-vs-email identity | B (doc fix) + C (write) + E (filter) | New row's default view shows for creator; PackedBy validated as member |
| 3. Mixed entity types leak | B | Client response is shaped `{trip,participants,items}`, no keys |
| 4. UpdateItem upsert | C | Bogus itemId → 404, no phantom row |
| 5. Reserved words / REMOVE vs SET | C | Status/Name updates succeed; cleared fields are absent, not null |
| 6. Numbers as strings | C | DynamoDB stores `N`; invalid numbers rejected |
| 7. Lost updates via PutItem | C | Edit path uses field-scoped UpdateItem only |
| 8. Client-only state rules | C (server) + D (UX) | Raw API can't create packed-without-owner |
| 9. Inline-edit React state | D | No focus loss / cross-row bleed; no controlled/uncontrolled warnings |
| 10. Whole-snapshot refetch | D + C (return row) | Single-row optimistic update; no per-edit snapshot GET |
| 11. Unstable item order | C | Deterministic order across reloads |
| 12. 403 vs 404 enumeration | B + C | Both cases return 404 |
| 13. Comments dangling refs | A | type-check + build green after removal |
| 14. Single-user E2E gap | F (+ C exposes assignment) | Multi-participant filter actually asserted |
| 15. E2E isolation + testids | D (testids) + F (isolation) | Parallel-worker green; scoped selectors |

## Sources

- Repository code (HIGH confidence — read directly): `apps/api/src/routes/api.ts`, `apps/api/src/plugins/auth.ts`, `apps/client/src/TripList.tsx`, `apps/client/src/api/api.ts`, `apps/e2e/src/db/init.ts`, `apps/e2e/tests/trip.spec.ts`, `packages/model/src/trip.ts`.
- Project docs: `dynamoDB-architecture.md` (live schema), `app-architecture.md` (note: `<UserId>` references are stale vs. the email-based implementation), `.planning/PROJECT.md`, `CLAUDE.md`.
- Established platform semantics (HIGH confidence, stable): DynamoDB reserved words (`Name`, `Status`), `UpdateItem` upsert-by-default behavior, DocumentClient number marshalling, React controlled-input keying — applied to this codebase's specifics.

---
*Pitfalls research for: shared editable item table on DynamoDB single-table with JWT-scoped multi-participant access*
*Researched: 2026-08-11*
