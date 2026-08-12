---
phase: 05-shared-item-model-comments-cleanup
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/model/src/item.ts
  - packages/model/src/index.ts
  - packages/model/src/comment.ts
  - apps/api/src/routes/api.ts
  - apps/client/src/Comments.tsx
  - apps/client/src/App.tsx
  - apps/client/src/api/api.ts
autonomous: true
requirements: [MODEL-01, MODEL-02]

estimate:
  tokens: 27000
  raw_tokens: 18000
  tasks: 2
  confidence: low        # derived: 0 completed plans in project → no calibration samples

must_haves:
  truths:
    # Goal-backward observable truths (D-02/D-06 contract + D-09 deletion)
    - "@packpixie/model exports Item, ItemStatus, and TripDetailResponse with the exact D-02/D-06 shape (implements MODEL-01)"
    - "ItemStatus is exactly the closed union 'to-buy' | 'found' | 'packed' with NO 'unset' member — an unset status is an absent field (D-04; resolves adjacency edge, verification: explicit)"
    - "Absent optional fields (weight, packedBy, status, category) denote unset, and TripDetailResponse.items may be [] for a trip with no items; the contract never uses null or '' for these (D-04; resolves empty edge, verification: explicit)"
    - "Item.createdAt (ISO string) exists in the contract as the deterministic ordering field so the client always has a stable sort key (D-03; resolves ordering edge, verification: explicit)"
    - "UsedBy and Carried are absent from the typed Item contract (D-08; implements MODEL-01 exclusion)"
    - "pnpm build is green across the monorepo (implements MODEL-01 + MODEL-02)"
    - "pnpm type-check is green across the monorepo — both apps/api and apps/client compile against the updated @packpixie/model (satisfies SC#2 per resolved intent)"
    - "The Comments scaffold is fully removed — no comment reference remains in source; the grep gate returns empty with /dist/ excluded after a model rebuild (implements MODEL-02)"
    # Flagged assumptions (probe edges genuinely out of scope for a compile-time artifact — NOT silently dropped)
    - { statement: "String fields (name, packedBy email, category) carry no length/equality/normalization contract in Phase 5 — they are plain TypeScript `string`; any normalization is a Phase 7 write-path concern", verification: backstop }
    - { statement: "FLAGGED ASSUMPTION — concurrency is not applicable to MODEL-01: Phase 5 produces compile-time type declarations only, with no runtime execution or persistence, so no concurrent-behavior guarantee exists to specify", verification: backstop }
    - { statement: "FLAGGED ASSUMPTION — concurrency is not applicable to MODEL-02: the Comments removal is a source-code deletion with no runtime concurrent behavior; orphaned COMMENTS DynamoDB records are accepted with no migration per D-09", verification: backstop }
  artifacts:
    - "packages/model/src/item.ts exists and exports ItemStatus, Item, TripDetailResponse"
    - "packages/model/src/index.ts contains export * from './item.js' and does NOT contain './comment.js'"
    - "packages/model/src/comment.ts no longer exists"
    - "apps/client/src/Comments.tsx no longer exists"
  key_links:
    - "index.ts barrel re-export wires item.ts into the @packpixie/model public API consumed by both apps"
    - "model package is rebuilt (fresh dist/) so apps resolve the new types and no stale dist/comment.d.ts masks an incomplete removal"
  prohibitions:
    # §B adversarial recall — kept prohibitions, descriptor-less (each disposes flagged-unverified)
    - "must NOT add UsedBy or Carried to the typed Item contract (D-08)"
    - "must NOT add an 'unset' member to ItemStatus (D-04)"
    - "must NOT store or type null or empty-string for optional fields — absence means unset (D-04)"
    - "must NOT leak internal DynamoDB keys (PK / SK / GSI*) into the typed contract (D-06)"
    - "must NOT add artificial dead or token imports of Item/TripDetailResponse to satisfy SC#2 (CLAUDE.md leave nothing unused behind; real imports deferred to Phases 6/8)"
    - "must NOT leave any Comments reference behind in source (D-09 / CLAUDE.md leave nothing unused behind)"
---

<objective>
Land the shared read type contract (`Item`, `ItemStatus`, `TripDetailResponse`) in `@packpixie/model` and fully remove the dead Comments scaffold across all three packages, with a green monorepo `pnpm build` + `pnpm type-check` and nothing unused left behind.

Purpose: This contract is the foundation Phases 6–10 build on (read API, write API, table UI, filters, E2E). The Comments scaffold is dead demo code that must go per "leave nothing unused behind."
Output: A new `packages/model/src/item.ts`, an updated barrel `index.ts`, and the complete deletion of the Comments feature (5 source sites) — verified green.
</objective>

<scope_note>
Phase 5 is **types only + deletion**. No persistence, no endpoints, no UI wiring. Real imports of `Item`/`TripDetailResponse` in apps/api and apps/client are DEFERRED to Phases 6/8 where genuine consumers exist. SC#2 ("both apps import the new types") is treated as satisfied once `@packpixie/model` builds and both apps' `pnpm type-check` passes against the updated package (both already depend on `@packpixie/model`). Do NOT add token/dead imports.
</scope_note>

<artifacts_this_phase_produces>
New symbols/files created by this phase (for the drift verifier — these are net-new, not pre-existing):
- `ItemStatus` — type alias, in `packages/model/src/item.ts`
- `Item` — interface, in `packages/model/src/item.ts`
- `TripDetailResponse` — interface, in `packages/model/src/item.ts`
- `packages/model/src/item.ts` — new file
- `export * from './item.js';` — new barrel re-export line in `packages/model/src/index.ts`

Symbols/files this phase DELETES:
- `TripComment`, `GetCommentsResponse` (from deleted `packages/model/src/comment.ts`)
- `getComments`, `postComment` (from `apps/client/src/api/api.ts`)
- `Comments` component (`apps/client/src/Comments.tsx`, deleted)
- `GET /comments`, `POST /comments` handlers (from `apps/api/src/routes/api.ts`)
- `export * from './comment.js';` (removed from the barrel)
</artifacts_this_phase_produces>

<execution_context>
@/Users/mikko.ravimo/git/personal/packPixie/.claude/gsd-core/workflows/execute-plan.md
@/Users/mikko.ravimo/git/personal/packPixie/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-shared-item-model-comments-cleanup/05-CONTEXT.md
@.planning/phases/05-shared-item-model-comments-cleanup/05-RESEARCH.md
@.planning/phases/05-shared-item-model-comments-cleanup/05-PATTERNS.md
@CLAUDE.md
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Land the Item/TripDetailResponse type contract in @packpixie/model and prove the monorepo compiles</name>
  <files>packages/model/src/item.ts, packages/model/src/index.ts</files>
  <read_first>
    - packages/model/src/trip.ts — the camelCase shared-DTO template (D-01) this file mirrors verbatim: plain `export interface`/`export type`, ISO-string dates, `participants: string[]`, no runtime code
    - packages/model/src/index.ts — the existing 3-line barrel (`export * from './status.js'` etc.); note `.js` extensions on `.ts` source (ESM)
    - packages/model/src/status.ts — sibling one-concept-per-file convention
    - .planning/phases/05-shared-item-model-comments-cleanup/05-CONTEXT.md — D-02 (Item shape) and D-06 (TripDetailResponse shape); implement VERBATIM, do not re-derive field names
  </read_first>
  <action>
    Create `packages/model/src/item.ts` implementing the D-02 and D-06 contract verbatim, following the `trip.ts` convention exactly. Export three symbols:
    - `ItemStatus`: a type alias union of exactly the three string literals `to-buy`, `found`, `packed` — with NO `unset` member (D-04: unset status is an absent field, not a sentinel).
    - `Item`: an interface with required fields `itemId: string`, `createdAt: string` (ISO, per D-03), `name: string`, `quantity: number` (spelled out per D-01, NOT `qty`), `consumable: boolean`; and optional fields `weight?: number` (absent = not set, distinct from 0), `packedBy?: string` (absent = unassigned; a member email when set, per D-05), `status?: ItemStatus` (absent = unset), `category?: string`. Do NOT add `UsedBy` or `Carried` (D-08). Do NOT add `PK`/`SK`/`GSI*` (D-06). Do NOT use `null` or `''` for optionals (D-04).
    - `TripDetailResponse`: an interface `{ tripId: string; tripName: string; participants: string[]; items: Item[] }` (D-06); `participants` reuses the `Trip.participants` email-array convention.
    Do NOT add write DTOs (`CreateItemRequest`/`UpdateItemRequest`) — those are deferred to Phase 7 (D-07).
    Then edit `packages/model/src/index.ts` to ADD `export * from './item.js';` (with the `.js` extension, matching siblings). Leave the existing status/trip/comment exports untouched in THIS task — the comment barrel line is removed atomically in Task 2 so the build stays green at every step.
    Rebuild the model package via the root Turbo scripts so its `dist/` reflects the new file, then prove both apps still compile against it.
  </action>
  <verify>
    <automated>pnpm build && pnpm type-check</automated>
  </verify>
  <acceptance_criteria>
    - Source: `packages/model/src/item.ts` contains `export type ItemStatus = 'to-buy' | 'found' | 'packed'` (no `'unset'`)
    - Source: `packages/model/src/item.ts` contains `export interface Item {`, `quantity: number`, `weight?: number`, `packedBy?: string`, `status?: ItemStatus`, `consumable: boolean`
    - Source: `packages/model/src/item.ts` contains `export interface TripDetailResponse {` with `items: Item[]`
    - Source: grep `-E 'UsedBy|Carried|qty|PK:|SK:|GSI'` over `packages/model/src/item.ts` returns empty
    - Source: `packages/model/src/index.ts` contains `export * from './item.js'`
    - Behavior: `pnpm build` exits 0
    - Behavior: `pnpm type-check` exits 0
    - Artifact: `packages/model/dist/item.d.ts` exists (proves the contract built into the public dist that apps resolve)
  </acceptance_criteria>
  <reversibility rating="costly">D-01 field naming is a published contract imported by both apps; renaming later touches every consumer and DTO mapping site. Costly, not one-way — no checkpoint required, but implement the names verbatim.</reversibility>
  <done>`Item`, `ItemStatus`, and `TripDetailResponse` are exported from `@packpixie/model` with the exact D-02/D-06 shape, the barrel re-exports `item.js`, and the whole monorepo builds and type-checks green.</done>
</task>

<task type="auto">
  <name>Task 2: Remove the Comments scaffold as one coherent change across all three packages</name>
  <files>packages/model/src/comment.ts, packages/model/src/index.ts, apps/api/src/routes/api.ts, apps/client/src/Comments.tsx, apps/client/src/App.tsx, apps/client/src/api/api.ts</files>
  <read_first>
    - apps/api/src/routes/api.ts — the `GET /comments` + `POST /comments` protected handlers to remove (lines ~99-143, the whole COMMENTS query/put blocks); the model import block (lines ~9-15) carries NO comment types, so no import edit is needed there. Confirm `QueryCommand`/`PutCommand` remain used by surviving trip routes before removing any SDK import (they are used elsewhere — do not remove blindly)
    - apps/client/src/api/api.ts — `getComments` (~39-47) and `postComment` (~49-60) functions to delete; the import block (~1-7) mixes still-needed types (`StatusResponse`, `CreateTripResponse`, `GetTripsResponse`) with the two to remove (`TripComment`, `GetCommentsResponse`)
    - apps/client/src/App.tsx — `import Comments from './Comments';` (line ~6) and `<Comments />` (line ~54) to remove
    - apps/client/src/Comments.tsx — the whole file to delete (the only client importer of the comment API + types)
    - packages/model/src/comment.ts — the whole file to delete (`TripComment`, `GetCommentsResponse`)
    - packages/model/src/index.ts — the barrel; remove the `export * from './comment.js';` line
    - .planning/phases/05-shared-item-model-comments-cleanup/05-RESEARCH.md — Runtime State Inventory (exact 5-site removal surface) and Pitfalls 1 & 3 (stale dist masking; partial import-line edits)
    - CLAUDE.md — ESM `.js` import extensions in `apps/api`; "leave nothing unused behind"; "do not remove TODO comments from code"
  </read_first>
  <action>
    Remove the entire Comments feature as one atomic change (D-09) across exactly these five source sites plus the barrel:
    1. `apps/api/src/routes/api.ts` — delete the `GET /comments` and `POST /comments` protected handlers in full (the COMMENTS partition query/put blocks between the auth-plugin register and the trip routes). Do NOT touch the surviving trip routes or the `// Do not remove TODO comments` project convention.
    2. `apps/client/src/Comments.tsx` — delete the entire file.
    3. `apps/client/src/App.tsx` — delete the `import Comments` line and the `<Comments />` render usage; leave surrounding imports/JSX intact.
    4. `apps/client/src/api/api.ts` — delete the `getComments` and `postComment` functions, and edit the import block to keep exactly `StatusResponse`, `CreateTripResponse`, `GetTripsResponse` while removing `TripComment` and `GetCommentsResponse` (avoid a dangling named import — Pitfall 3).
    5. `packages/model/src/comment.ts` — delete the entire file.
    6. `packages/model/src/index.ts` — remove the `export * from './comment.js';` line.
    No DynamoDB data migration — the `COMMENTS` partition is self-contained and simply stops being read/written (D-09). Rebuild the model package via the root Turbo scripts so stale `dist/comment.d.ts` cannot mask an incomplete removal (Pitfall 1), then confirm the whole monorepo is green and no `comment` reference survives in source.
  </action>
  <verify>
    <automated>pnpm build && pnpm type-check && test -z "$(grep -rniI comment apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v /dist/)"</automated>
  </verify>
  <acceptance_criteria>
    - Artifact: `packages/model/src/comment.ts` no longer exists (`test ! -e packages/model/src/comment.ts`)
    - Artifact: `apps/client/src/Comments.tsx` no longer exists (`test ! -e apps/client/src/Comments.tsx`)
    - Source: `packages/model/src/index.ts` does NOT contain `./comment.js`
    - Source: `apps/client/src/api/api.ts` does NOT contain `getComments`, `postComment`, `TripComment`, or `GetCommentsResponse`; still imports `StatusResponse`, `CreateTripResponse`, `GetTripsResponse`
    - Source: `apps/client/src/App.tsx` does NOT contain `Comments`
    - Source: `apps/api/src/routes/api.ts` does NOT contain `/comments`
    - Grep gate: `grep -rniI comment apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v /dist/` returns empty (after model rebuild)
    - Behavior: `pnpm build` exits 0
    - Behavior: `pnpm type-check` exits 0
  </acceptance_criteria>
  <done>All five Comments source sites plus the barrel re-export are removed, the `COMMENTS` records are left orphaned per D-09 with no migration, the grep gate is empty, and the monorepo builds and type-checks green.</done>
</task>

</tasks>

<threat_model>
Security enforcement: ASVS Level 1, block_on = high. This phase declares compile-time types and DELETES two protected endpoints; it adds no new runtime code paths and therefore introduces no new threats — it reduces attack surface.

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | No new trust boundary is introduced. Comment routes lived behind the existing protected (auth-required) scope; removing them only shrinks the authenticated surface. The Phase 6 participation guard is where the trip trust boundary is enforced. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-05-01 | Information disclosure | Orphaned `COMMENTS` DynamoDB partition records | low | accept | Accepted per D-09: self-contained demo data with no reader after route removal; no migration. Records become unreachable once `GET`/`POST /comments` are gone. |
| T-05-02 | Tampering | Dangling client caller of a removed route | low | mitigate | Grep gate + `pnpm type-check` catch any dangling caller/import (Task 2 verify); removal is atomic across all 5 sites (D-09). |

No package-manager installs occur in this phase (no `pnpm add`/`npm install`), so no supply-chain (`T-05-SC`) threat applies and no package-legitimacy checkpoint is required.
</threat_model>

<verification>
Phase-level gate (run from repo root, through Turbo — do not bypass):
1. `pnpm build` exits 0 (model builds first via Turbo `^build`; apps compile against fresh `dist/`).
2. `pnpm type-check` exits 0 across the monorepo (both apps compile against updated `@packpixie/model` — satisfies SC#2 per resolved intent; no dead token imports added).
3. Grep gate empty: `grep -rniI comment apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v /dist/` returns nothing (after model rebuild so stale `dist/comment.d.ts` cannot mask an incomplete removal).
4. Source assertions: `item.ts` exports `Item`/`ItemStatus`/`TripDetailResponse` with the D-02/D-06 shape; barrel has `./item.js` and not `./comment.js`; `comment.ts` and `Comments.tsx` deleted.
</verification>

<success_criteria>
- `@packpixie/model` exports `Item`, `ItemStatus`, and `TripDetailResponse` (D-02/D-06 verbatim), with `UsedBy`/`Carried` excluded (SC#1 / MODEL-01).
- `pnpm type-check` passes across the monorepo; both apps compile against the updated model (SC#2, resolved intent — no dead imports).
- The Comments scaffold is fully removed — comment API routes, `Comments.tsx`, `comment.ts`, and client comment API functions — with no dangling references (SC#3 / MODEL-02).
- `pnpm build` is green with nothing unused left behind (SC#4).
</success_criteria>

<output>
Create `.planning/phases/05-shared-item-model-comments-cleanup/05-01-SUMMARY.md` when done.
</output>
