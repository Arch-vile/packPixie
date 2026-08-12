# Phase 5: Shared Item Model & Comments Cleanup - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Land the shared `Item` / `TripDetailResponse` **read** type contract in `@packpixie/model`, consumed by both `apps/api` and `apps/client`, and fully remove the dead `Comments` scaffold — with `pnpm type-check` and `pnpm build` green across the monorepo and nothing unused left behind.

This phase defines **types only** (no persistence, no endpoints, no UI) plus a self-contained deletion. The read/write APIs and UI that consume these types are Phases 6–10.

</domain>

<decisions>
## Implementation Decisions

### Item type shape

- **D-01:** Field naming is **camelCase with full words**, matching the existing `Trip` DTO convention (`tripId`, `tripName`, `createdAt`). The DynamoDB storage attributes stay PascalCase (`Name`, `Qty`, `PackedBy`, ...); a mapping layer in the persistence code translates between them — exactly as `Trip` already does today. Note `quantity` (spelled out), not `qty`. — **Reversibility:** costly — the field names are a published contract imported by both `apps/api` and `apps/client`; renaming later touches every consumer and every DTO mapping site.

- **D-02:** The resolved `Item` contract:
  ```ts
  type ItemStatus = 'to-buy' | 'found' | 'packed';

  interface Item {
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
  ```

- **D-03:** **`createdAt` is included in the `Item` contract now** (deviating from the researcher's "defer to Phase 7" note). Baking a stable ordering field into the type from day one means Phase 7 (which owns the id/sort strategy) only has to populate it, and the client always has a deterministic sort key. Addresses PITFALLS #11 (random-UUID arbitrary order) at the contract level. — **Reversibility:** reversible — schemaless storage; the field can be dropped or its semantics changed before any data exists.

- **D-04:** Unset optional attributes (`weight`, `packedBy`, `status`) are modeled as **optional TypeScript fields** (`weight?`, etc.) — field absence means unset, mirroring the DynamoDB "omit the attribute" semantics (`dynamoDB-architecture.md` §3). `ItemStatus` has **no `'unset'` member**; an unset status is simply an absent field. This keeps `attribute_exists(...)` storage semantics (relied on by Phase 7 state rules) aligned with the type. Never store `null`/`""` for these.

- **D-05:** `packedBy`, when set, is a **participant email** (lowercased JWT email), consistent with the locked identity decision — not a Cognito `sub`. Phase 5 only types it as `string`; validation that it is a member is a Phase 7 concern.

### TripDetailResponse shape

- **D-06:** `TripDetailResponse` = `{ tripId: string; tripName: string; participants: string[]; items: Item[] }`. `participants` reuses the existing `Trip.participants` convention (an array of participant **emails**). No internal DynamoDB keys (`PK`/`SK`/`GSI*`) appear anywhere in the contract (enforced downstream in Phase 6's mapping; the type simply doesn't carry them).

### Contract scope

- **D-07:** Phase 5 lands the **read contract only**: `Item`, `ItemStatus`, and `TripDetailResponse`. Write request DTOs (`CreateItemRequest` / `UpdateItemRequest`) are **deferred to Phase 7**, where the write API lives. Matches MODEL-01 and the roadmap success criteria exactly; keeps this phase minimal.

- **D-08:** `UsedBy` and `Carried` are **excluded from the typed contract entirely** (carried-forward locked decision). Schemaless storage means they can be added in a later milestone at zero migration cost. Do not add them to `Item`.

### Comments cleanup

- **D-09:** Remove the Comments scaffold as **one coherent change across all three packages** (per PITFALLS #13 and CLAUDE.md "leave nothing unused behind"):
  - `apps/api/src/routes/api.ts` — the `GET /comments` and `POST /comments` protected handlers (incl. the `COMMENTS` partition read/write)
  - `apps/client/src/Comments.tsx` — the component file (delete)
  - `apps/client/src/App.tsx` — the `import Comments` and `<Comments />` usage (lines 6, 54)
  - `apps/client/src/api/api.ts` — `getComments` / `postComment` functions and the `TripComment` / `GetCommentsResponse` imports
  - `packages/model/src/comment.ts` — delete the file and its `export * from './comment.js'` re-export in `index.ts`
  - No data migration — `COMMENTS` is a self-contained partition; just stop writing it.
  - Verify with `pnpm type-check` **and** `pnpm build` after removal.

### Claude's Discretion
- Exact file layout inside `packages/model/src` (e.g. whether `Item`/`ItemStatus` live in a new `item.ts` or extend `trip.ts`) — follow the existing one-concept-per-file convention (`status.ts`, `trip.ts`), so a new `item.ts` re-exported from `index.ts` is the natural fit, but the planner may decide.
- Whether `TripDetailResponse` lives in `item.ts` or `trip.ts` — it spans both concepts; planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data model & storage semantics
- `dynamoDB-architecture.md` §2–§3 — canonical item attributes (`Name`, `Qty`, `Weight`, `PackedBy`, `UsedBy`, `Carried`, `Status`, `Consumable`, `Category`), the `Status` value set (`to-buy`/`found`/`packed` or omitted), and the "omit the attribute when unassigned" rule that D-04 mirrors. **Note:** this doc describes `PackedBy` as `<UserId>` — that is stale; identity is lowercased email (corrected in Phase 6).
- `app-architecture.md` §5.2 — trip/item data model. **Note:** contains stale `<UserId>` references; email is authoritative.

### Existing model convention to match
- `packages/model/src/trip.ts` — the camelCase DTO convention D-01 follows (`tripId`, `tripName`, `createdAt`, `participants: string[]`).
- `packages/model/src/index.ts` — barrel re-export pattern (`export * from './xxx.js'`) the new `Item` types must join and the `comment.ts` export must leave.

### Research (this milestone)
- `.planning/research/PITFALLS.md` #13 — exact Comments-removal surface across all three packages (grounds D-09). #11 — item ordering rationale (grounds D-03). #6 — numbers-as-numbers (informs the `number` typing of `quantity`/`weight`).

### Conventions
- `CLAUDE.md` — ESM `.js` import extensions in `apps/api`; "leave nothing unused behind" (grounds the completeness of D-09).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/model/src/trip.ts` — `Trip` interface is the naming/shape template for `Item`; `TripDetailResponse.participants: string[]` reuses `Trip.participants` (emails).
- `packages/model/src/index.ts` — three-line barrel; add the item export, drop the comment export.

### Established Patterns
- One concept per file in `packages/model/src` (`status.ts`, `trip.ts`, `comment.ts`) re-exported through `index.ts`.
- Client/API consume `@packpixie/model` types directly (e.g. `apps/client/src/api/api.ts` imports `TripComment`, `GetCommentsResponse` — these go away).

### Integration Points
- `apps/api/src/routes/api.ts` — currently the only API consumer touched (Comments routes removed). It does **not** yet import `Item`/`TripDetailResponse`; that wiring is Phase 6.
- `apps/client/src/App.tsx`, `apps/client/src/api/api.ts`, `apps/client/src/Comments.tsx` — the client-side Comments removal surface.
- Success criterion "both `apps/api` and `apps/client` import the new types": the cleanest satisfy-now approach is to have each side import at least one new type (even a re-export touchpoint), or the planner may treat this as satisfied once the consuming phases (6/8) wire them — planner should confirm the roadmap's intent that the *import* happens in Phase 5. (SC #2 literally requires both apps to import the new types with type-check green.)

</code_context>

<specifics>
## Specific Ideas

- Resolved contract is fully specified above (D-02, D-06) — the planner should implement it verbatim, not re-derive field names.
- `createdAt` is `string` (ISO), consistent with `Trip.createdAt`.

</specifics>

<deferred>
## Deferred Ideas

- **Write request DTOs** (`CreateItemRequest` / `UpdateItemRequest`) → Phase 7 (item write API).
- **`createdAt` population + item id/sort strategy** (ULID vs `createdAt#uuid` SK vs client-side sort) → Phase 7. Phase 5 only declares the field exists.
- **`PackedBy`-is-a-member validation** → Phase 7 (write path).
- **Stripping internal keys in the mapped response** → Phase 6 (read API mapping); the type simply omits them.
- **`UsedBy` / `Carried` / Distribution** → v2.x milestone (excluded from typed contract, D-08).

None of the above are in Phase 5 scope — discussion stayed within the type-contract + cleanup boundary.

</deferred>

---

*Phase: 5-Shared Item Model & Comments Cleanup*
*Context gathered: 2026-08-12*
