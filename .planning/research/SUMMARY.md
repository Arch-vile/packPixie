# Project Research Summary

**Project:** PackPixie — v2.0 Packing Table MVP
**Domain:** Shared, multi-participant editable item table added to an existing React 19 + Vite SPA / Fastify 5 + DynamoDB single-table + Cognito monorepo
**Researched:** 2026-08-11
**Confidence:** HIGH

## Executive Summary

This milestone is **integration work on an existing app, not a greenfield build**. All four research streams converge on the same headline: **the work is code, not stack.** Every capability the packing table needs — React controlled inputs, `fetch` + hooks state, DynamoDB `UpdateCommand`/`DeleteCommand`, Tailwind styling — is already installed and in daily use. There are **zero new npm dependencies** for the backend and shared-model work; the only genuine dependency question is whether to add `react-router-dom` for URL-addressable trip pages (STACK recommends deferring it and using a `useState` view toggle; ARCHITECTURE leans toward adding it for E2E deep-linking — an open question requirements must settle). The "install" step is really two SDK command imports plus a new shared-types file.

The single most important thing to get right is **security and identity**. Two convergent findings dominate risk. First, **identity in this app is the lowercased EMAIL, not `UserId`/`sub`** — participants live under `SK = USER#<email>`, and `PackedBy`, the default "my items" view, and every membership check must key off `request.user.email`. The architecture docs still say `<UserId>`; **that is stale relative to the implemented code** and, if trusted, silently breaks the default view and participation logic without throwing. Second, the new item routes derive their partition from a URL `tripId`, so **without a per-request participation guard they are a textbook IDOR/BOLA hole**: any authenticated user could read or mutate any trip. The mitigation is a mandatory `GetItem(PK=TRIP#<id>, SK=USER#<email>)` membership check before every item handler, returning **404 (not 403)** to non-members so trip existence can't be enumerated.

Beyond authorization, the risks are concrete and well-understood DynamoDB and shared-state traps: reserved words (`Status`, `Name` need `ExpressionAttributeNames`); clearing a field means `REMOVE`, not `SET null`; numeric coercion so `Qty`/`Weight` marshal as `N` not `S`; `attribute_exists` conditions to stop `UpdateItem` upserting orphan rows; field-scoped `UpdateItem` (never whole-item `PutItem`) to avoid lost updates on the shared table; and **server-authoritative state-transition rules** (`packed` requires `PackedBy`; clearing `PackedBy` resets `Status`) because there is no single trusted client. The recommended approach keeps the codebase's deliberately-vanilla style, defers `UsedBy`/`Carried` entirely out of the typed DTOs (DynamoDB is schemaless — no migration cost later), and seeds a second participant in E2E so the `PackedBy = me` filter is genuinely tested rather than trivially passing.

## Key Findings

### Recommended Stack

**Reuse everything; add nothing.** See [STACK.md](./STACK.md). The packing table is a fixed 7-column `<table>` of controlled inputs with client-side filtering — well below the threshold where a grid library, data-fetching library, global store, or form library earns its weight. Persistence uses two additional SDK command imports (`UpdateCommand`, `DeleteCommand`, plus `GetCommand`) from the already-installed `@aws-sdk/lib-dynamodb`. Validation matches the existing manual-check route style (Fastify bundles Ajv if schema-driven 400s are wanted — still no new dep). Testing stays E2E-only (Playwright), per PROJECT.md.

**Core technologies (all already present):**
- React 19 (controlled inputs + `useReducer`/`useState`) — trivial for a fixed-schema table with simple client-side filters
- `@aws-sdk/lib-dynamodb` (`UpdateCommand`/`DeleteCommand`/`GetCommand`) — already the app's DynamoDB access layer; just add imports
- Fastify 5 (new item routes in the existing protected scope) — `authPlugin` already decorates `request.user`
- `@packpixie/model` (new `item.ts`) — shared DTO contract compiled by both api and client
- Tailwind v4 + Playwright — styling and E2E already wired

**Do NOT add:** TanStack Table/AG Grid, React Query/SWR, Zustand/Redux, react-hook-form/Formik, zod as a new dep, a DynamoDB ODM, or a unit-test runner. Each solves a problem this milestone explicitly defers.

### Expected Features

The in-scope surface is exactly **seven columns** — Name, Quantity, Weight (g, per-unit, nullable), PackedBy (participant email, nullable), Status (`unset`/`to-buy`/`found`/`packed`), Category (free text), Consumable (bool) — with CRUD, a default `PackedBy = me` view, a Status filter, and a show-all toggle. See [FEATURES.md](./FEATURES.md).

**Must have (table stakes):**
- Trip-detail page with single-query snapshot load (prerequisite for everything)
- Add row (defaults `PackedBy = me`), inline-edit all 7 fields, delete row, persist via `UpdateItem`
- Default `PackedBy = me` view + Status filter + show-all toggle (all client-side over one load)
- State rules: new-row `PackedBy = me`; `packed` requires `PackedBy`; clearing `PackedBy` resets `Status`
- Empty state; remove the Comments scaffold; E2E happy path

**Should have (defer to v2.x):**
- Optimistic UI + rollback, category presets/autocomplete, column sort, multi-status filter, keyboard-fast entry

**Defer (later milestones — must NOT leak into designs):**
- `UsedBy` usage-sets, Distribution/`Carried`/fairness, copy-a-trip, Summary, cross-user edit confirmation, full filter bar, real-time sync

### Architecture Approach

Subsequent-milestone integration that reuses the single-table schema, auth flow, and DTO conventions as-is. See [ARCHITECTURE.md](./ARCHITECTURE.md). The pattern is: **one `Query PK=TRIP#<id>` snapshot** returning META + participants + items, split by `SK` prefix in code and shaped into key-stripped DTOs; **targeted `Put`/`Update`/`Delete`** mutations keyed by `ITEM#<id>`; **a per-request participation guard**; and **server-enforced correctness rules**. Filtering is pure client-side over the loaded array. **`UsedBy`/`Carried` are excluded from the typed DTOs now** — DynamoDB is schemaless so there is zero data-layer cost to adding them later, and including them now is untested dead surface (String-Set marshalling the code has never exercised). The item reader ignores unknown attributes for forward-compat.

**Major components:**
1. `packages/model/src/item.ts` (NEW) + `TripDetailResponse` — the compile-time contract; build first
2. `apps/api` — 4 new routes (`GET /trips/:tripId`, `POST/PATCH/DELETE .../items/...`) + `assertParticipant` guard + invariant checks
3. `apps/client` — `TripDetailPage` owning the snapshot/filter state, `ItemTable`/`ItemRow`/`AddItemRow`, item fetch wrappers
4. `apps/e2e` — `items.spec.ts` happy path with a seeded second participant

**Build order (dependency-respecting):** model → api → client → e2e. Comments-scaffold removal threads through model/api/client in the same pass ("leave nothing unused behind").

### Critical Pitfalls

Top risks, all grounded in the live code. See [PITFALLS.md](./PITFALLS.md).

1. **IDOR/BOLA on item routes (dominant risk)** — routes derive the partition from URL `tripId`; auth != authorization. Add a mandatory `GetItem(PK=TRIP#<id>, SK=USER#<email>)` membership guard before every read and mutation; return **404 to non-members** (never 403 — 403-vs-404 leaks trip existence).
2. **Identity is EMAIL, not `sub`/`UserId`** — docs are stale. Key `PackedBy`, the default view, and membership off lowercased `request.user.email`; validate `PackedBy` is an actual participant. Fix the stale doc so it doesn't reintroduce the bug.
3. **DynamoDB write traps** — `Status`/`Name` are reserved words (use `ExpressionAttributeNames`); "clear a field" is `REMOVE`, not `SET null`; coerce `Qty`/`Weight` to numbers so they marshal as `N`; add `ConditionExpression: attribute_exists(PK)` so `UpdateItem` can't upsert orphan rows.
4. **State rules must be server-authoritative** — enforcing `packed`-requires-`PackedBy` and clear-`PackedBy`-resets-`Status` only in React is trivially bypassed on a shared table. Enforce server-side (clearing does `REMOVE PackedBy, #status` atomically in one `UpdateItem`); mirror in the UI for UX.
5. **Shared-state hazards** — use field-scoped `UpdateItem` (never whole-item `PutItem`) to avoid lost updates; optimistically update the single edited row and reconcile with the returned row rather than refetching the whole snapshot; give items a `CreatedAt`/sortable id for stable order.
6. **E2E needs a second participant** — a single Cognito test user can't exercise the `PackedBy = me` vs "someone else" filter. Seed a second `USER#<email>` participant (via trip-create `participantEmails` and/or the E2E DynamoDB client) and add stable `data-testid`s.

## Implications for Roadmap

Research strongly suggests a **backend-security-first, then UI, then E2E** structure. The pitfalls map cleanly onto phases, and the build order is forced by the `@packpixie/model` compile-time dependency. Suggested phases (labels topical):

### Phase A: Comments-scaffold removal + shared Item model
**Rationale:** Cleanup touches disjoint files and can run early/parallel; the `Item` DTO is a compile-time prerequisite for both api and client, so it must land first. Doing both together honors "leave nothing unused behind" in one pass.
**Delivers:** `packages/model/src/item.ts` + `TripDetailResponse`; `comment.ts`/`Comments.tsx`/comment routes+fns removed; `pnpm type-check` + `build` green.
**Addresses:** shared model contract; Comments removal (FEATURES cleanup requirement).
**Avoids:** Pitfall 13 (dangling comment refs); Anti-pattern 3 (excludes `UsedBy`/`Carried` from DTOs).

### Phase B: Snapshot/read API + participation guard
**Rationale:** The single-query load is the prerequisite for the whole UI, and it's where the participation guard, the 404 contract, and the doc-correction (`UserId` -> email) are introduced. Security foundation before any mutation exists.
**Delivers:** `GET /trips/:tripId` returning shaped `{trip, participants, items}`; `assertParticipant` in `lib/authz.ts`; stale-doc fix.
**Uses:** existing `QueryCommand`; `GetCommand` (new import).
**Avoids:** Pitfalls 1 (IDOR), 2 (identity), 3 (entity-type leak), 12 (403-vs-404).

### Phase C: Item CRUD API + server-authoritative state rules
**Rationale:** With the guard in place, add the write path. This is the densest pitfall cluster — reserved words, REMOVE-vs-SET, numeric coercion, `attribute_exists`, field-scoped updates, state invariants, stable ordering.
**Delivers:** `POST/PATCH/DELETE .../items/...` with `assertParticipant`, invariant checks, `attribute_exists(PK)`; mutation endpoints return the updated row; `CreatedAt`/sortable id.
**Uses:** `UpdateCommand`/`DeleteCommand` (new imports).
**Avoids:** Pitfalls 4, 5, 6, 7, 8 (server side), 11.

### Phase D: Trip-detail inline-edit table (UI)
**Rationale:** Once the API is real, build the client against it. Owns the snapshot/filter state and the inline-edit UX, mirroring the state rules for feedback.
**Delivers:** trip-detail navigation, `TripDetailPage`/`ItemTable`/`ItemRow`/`AddItemRow`, item fetch wrappers, `data-testid`s; optimistic single-row update.
**Uses:** React controlled inputs + `useReducer`; router-vs-`useState` toggle decision (open question).
**Avoids:** Pitfalls 8 (UX mirror), 9 (React keying/focus), 10 (no full-snapshot refetch), 15 (testids).

### Phase E: Packing-view filters
**Rationale:** Default `PackedBy = me`, Status filter, and show-all are pure client-side refinements over the loaded snapshot — small, but where the identity-driven default view is verified.
**Delivers:** default personal view, Status filter, show-all toggle (all in-memory).
**Avoids:** Pitfalls 2 (filter identity), Anti-pattern 4 (no server-side filtering).

### Phase F: E2E item-table coverage
**Rationale:** Hard sequential tail — exercises the full running stack. Must seed a second participant to truly test the personal-view filter.
**Delivers:** `items.spec.ts` happy path (open -> add -> edit status -> delete) + multi-participant filter assertion; per-trip isolation.
**Avoids:** Pitfalls 14 (single-user gap), 15 (isolation/testids).

### Phase Ordering Rationale
- **Model first is forced:** `@packpixie/model` is a build-time dependency of both apps; nothing type-checks without it.
- **Security before UI:** the participation guard and email-identity decision are the milestone's dominant risks and must be established in the read/write API phases, not retrofitted.
- **API before client:** client fetch wrappers and E2E assertions are written against real endpoints.
- **E2E last:** it's the only step exercising the full stack; it also constrains Phase C (expose `PackedBy` assignment for tests).
- **Parallelization:** Phase A can run alongside early B; C and D can overlap once model types merge; F is a strict tail.

### Research Flags

Phases likely needing deeper research/discussion during planning:
- **Phase C (Item CRUD API):** highest pitfall density — the dynamic `SET`/`REMOVE` expression builder, reserved-word handling, numeric coercion, and atomic clear-and-reset warrant careful planning (patterns are documented in ARCHITECTURE, so this is discuss-level, not new external research).
- **Phase D (UI):** the router-vs-`useState` decision and inline-edit React state model (keying, focus, optimistic reconcile) benefit from an explicit design pass.
- **Phase F (E2E):** the second-participant strategy (trip-create `participantEmails` vs direct DynamoDB Local seeding) should be decided deliberately, not mid-test.

Phases with standard patterns (skip research-phase):
- **Phase A:** mechanical cleanup + a straightforward DTO file.
- **Phase B:** the single-query-split pattern already exists in `/trips`; the guard is a small helper.
- **Phase E:** trivial client-side `useMemo` filtering over loaded state.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Grounded in the actual codebase and installed versions, not third-party docs; "add nothing" is verifiable from `package.json`. |
| Features | HIGH | Derived from the authoritative product spec (`app-description.md` §5/§10/§16) cross-checked against the live data model and code. |
| Architecture | HIGH | All patterns grounded in current source; reuses established conventions; deferred-field decision explicit. |
| Pitfalls | HIGH | Every pitfall read directly from repository code; platform semantics (reserved words, upsert, marshalling) are stable. |

**Overall confidence:** HIGH

### Gaps to Address

Open questions requirements must resolve before/while planning:

- **New-row default `Status`:** unspecified by the spec. Recommend `unset` (or `to-buy`). Affects test expectations — decide before writing REQs.
- **Category: enum vs free text:** spec keeps it free text for MVP; confirm no preset list is required (presets are deferred convenience).
- **Router vs `useState` view-toggle:** STACK recommends `useState` (no router today, one new view); ARCHITECTURE leans `react-router-dom` for URL-addressable pages + E2E deep-linking. This is the one real new-dependency decision — settle it in Phase D planning.
- **Delete confirmation:** hard delete confirmed (no undo); confirm no confirmation dialog (consistent with the permissive/no-confirm decision).
- **Weight-not-set representation:** decide `0` vs attribute-absent (`REMOVE`) and document it, since it interacts with the deferred weight-total work.
- **Invisible `UsedBy`/`Carried` on create/clear:** decide whether the backend maintains the spec's defaults (keeps data spec-consistent for future milestones) or leaves them entirely unset. Recommend maintaining them non-UI — but keep strictly out of the typed DTOs.
- **Stale doc correction:** `dynamoDB-architecture.md` / `app-architecture.md` `<UserId>` references must be corrected to email during Phase B to stop reintroducing the identity pitfall.

## Sources

### Primary (HIGH confidence)
- Repository code — `apps/api/src/routes/api.ts`, `apps/api/src/plugins/auth.ts`, `apps/client/src/{App,TripList,Comments}.tsx`, `apps/client/src/api/api.ts`, `apps/e2e/src/db/init.ts`, `apps/e2e/tests/trip.spec.ts`, `packages/model/src/*`, `package.json`s — installed stack, route/auth/identity conventions, E2E harness
- `dynamoDB-architecture.md` — single-table schema, single-query load, `UpdateItem` access pattern (note: `<UserId>` is stale vs. email implementation)
- `app-description.md` §5/§10/§11/§16 — packing fields, new-row defaults, state-transition invariants, filter behavior
- `app-architecture.md` §5–8 — deferred version/change-feed design informing deferral decisions
- `.planning/PROJECT.md`, `CLAUDE.md` — milestone scope, deferred list, E2E-only testing, conventions

### Secondary (MEDIUM confidence)
- Established platform semantics — DynamoDB reserved words (`Name`, `Status`), `UpdateItem` upsert-by-default, DocumentClient number marshalling, React controlled-input keying — stable, applied to this codebase's specifics

### Tertiary (LOW confidence)
- None — all findings are grounded in first-party code or stable platform behavior

---
*Research completed: 2026-08-11*
*Ready for roadmap: yes*
