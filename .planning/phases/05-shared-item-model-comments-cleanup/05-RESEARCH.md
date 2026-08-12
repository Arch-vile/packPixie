# Phase 5: Shared Item Model & Comments Cleanup - Research

**Researched:** 2026-08-12
**Domain:** TypeScript shared-type contract design in a pnpm + Turbo monorepo; dead-code removal across three packages
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Field naming is **camelCase with full words**, matching the existing `Trip` DTO convention (`tripId`, `tripName`, `createdAt`). DynamoDB storage attributes stay PascalCase (`Name`, `Qty`, `PackedBy`, ...); a mapping layer in the persistence code translates between them — as `Trip` already does. Note `quantity` (spelled out), not `qty`. — *Reversibility: costly (published contract imported by both apps).*

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

- **D-03:** `createdAt` is **included in the `Item` contract now** (deviates from the "defer to Phase 7" note). Phase 7 only populates it. — *Reversibility: reversible (schemaless storage, no data yet).*

- **D-04:** Unset optional attributes (`weight`, `packedBy`, `status`) are modeled as **optional TypeScript fields** — field absence means unset, mirroring DynamoDB "omit the attribute" semantics. `ItemStatus` has **no `'unset'` member**. Never store `null`/`""`.

- **D-05:** `packedBy`, when set, is a **participant email** (lowercased JWT email), not a Cognito `sub`. Phase 5 types it as `string` only; membership validation is Phase 7.

- **D-06:** `TripDetailResponse` = `{ tripId: string; tripName: string; participants: string[]; items: Item[] }`. `participants` is an array of participant **emails**. No internal DynamoDB keys (`PK`/`SK`/`GSI*`) appear in the contract.

- **D-07:** Phase 5 lands the **read contract only**: `Item`, `ItemStatus`, `TripDetailResponse`. Write DTOs (`CreateItemRequest`/`UpdateItemRequest`) are **deferred to Phase 7**.

- **D-08:** `UsedBy` and `Carried` are **excluded from the typed contract entirely**. Do not add them to `Item`.

- **D-09:** Remove the Comments scaffold as **one coherent change across all three packages** (see Runtime State Inventory below for the exact surface). No data migration — `COMMENTS` is a self-contained partition. Verify with `pnpm type-check` **and** `pnpm build`.

### Claude's Discretion

- Exact file layout inside `packages/model/src` (new `item.ts` re-exported from `index.ts` is the natural fit, following the one-concept-per-file convention, but the planner may decide).
- Whether `TripDetailResponse` lives in `item.ts` or `trip.ts` — it spans both concepts; planner's call.

### Deferred Ideas (OUT OF SCOPE)

- Write request DTOs (`CreateItemRequest`/`UpdateItemRequest`) → Phase 7.
- `createdAt` population + item id/sort strategy → Phase 7.
- `PackedBy`-is-a-member validation → Phase 7.
- Stripping internal keys in the mapped response → Phase 6.
- `UsedBy` / `Carried` / Distribution → v2.x milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODEL-01 | A shared `Item` type and a trip-detail response DTO exist in `@packpixie/model`, consumed by both api and client (`UsedBy`/`Carried` excluded from the typed DTOs) | Contract fully specified by D-02/D-06/D-08; existing `Trip` DTO in `packages/model/src/trip.ts` is the verbatim template; barrel export pattern in `index.ts` verified. See Standard Stack, Code Examples. |
| MODEL-02 | The `Comments` scaffold is fully removed — API routes, `Comments.tsx`, the comment model, and client api functions — with `pnpm type-check` and `pnpm build` green | Complete removal surface verified across all 5 source sites + build artifacts. See Runtime State Inventory, Common Pitfalls. |
</phase_requirements>

## Summary

This is a small, **entirely in-repo, code-only** phase with two independent workstreams: (1) add a read-only type contract (`Item`, `ItemStatus`, `TripDetailResponse`) to `@packpixie/model`, and (2) delete the dead Comments scaffold across all three packages. There are **no external packages to install**, no network research required, and no runtime behavior beyond what the TypeScript compiler enforces. Every claim in this document was verified by reading the source files this session.

The contract itself is fully pre-specified by the locked decisions (D-02, D-06) — the planner should implement it **verbatim**, not re-derive field names. The single genuine design question is how to literally satisfy Success Criterion #2 ("both `apps/api` and `apps/client` import the new types") in a phase where neither app has a real consumer yet (those arrive in Phases 6/8), given the hard CLAUDE.md rule "leave nothing unused behind." This is the one item that warrants a planner decision (see Open Questions).

The most important execution hazard is monorepo build ordering: apps consume `@packpixie/model` through its compiled `dist/` output, and Turbo's `type-check` task `dependsOn: ["^build"]`. A stale `dist/comment.d.ts` will linger after `comment.ts` is deleted from source unless the model package is rebuilt (or cleaned), which can mask an incomplete removal.

**Primary recommendation:** Add a new `packages/model/src/item.ts` (one concept per file) exporting `ItemStatus`, `Item`, and `TripDetailResponse` verbatim from D-02/D-06; wire it into the `index.ts` barrel; remove all five Comments sites in the same change; then run `pnpm build` **before** `pnpm type-check` so apps compile against fresh model `dist/`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `Item` / `ItemStatus` / `TripDetailResponse` type definitions | Shared model (`packages/model`) | — | Type contract imported by both API and client; must live in the shared package, not either app [VERIFIED: packages/model/src/trip.ts:1-6 establishes this pattern for `Trip`] |
| Consuming the new types | API + Client (import sites) | — | Both `apps/api` and `apps/client` already depend on `@packpixie/model`; SC#2 requires both to import the new types |
| Comment API route removal | API (`apps/api`) | — | `GET`/`POST /comments` handlers live in the protected route scope [VERIFIED: apps/api/src/routes/api.ts:99-143] |
| Comment UI removal | Client (`apps/client`) | — | `Comments.tsx` component + `App.tsx` usage [VERIFIED: apps/client/src/App.tsx:6,54] |
| Comment model removal | Shared model | Client + API import sites | `comment.ts` + barrel re-export + all importers [VERIFIED: packages/model/src/index.ts:3] |

## Standard Stack

This phase installs **no new dependencies**. It uses only the existing monorepo toolchain.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | ^5.9.2 (model devDep); ^5.x monorepo-wide | Type declarations + `tsc` build/typecheck | Already the project's type system [VERIFIED: packages/model/package.json devDependencies] |
| turbo | ^2.5.6 | Orchestrates `build` / `type-check` across packages | Already the monorepo task runner [VERIFIED: root package.json devDependencies + turbo.json] |
| pnpm | 10.12.1 | Package manager / workspace linker | `packageManager` field pins it [VERIFIED: packages/model/package.json:packageManager] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `item.ts` file | Extend `trip.ts` | Discretion (D per CONTEXT); one-concept-per-file convention (`status.ts`, `trip.ts`, `comment.ts`) favors a new `item.ts` [VERIFIED: packages/model/src/ listing] |

**Installation:** None. No `pnpm add` in this phase.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.** No `pnpm add` / `npm install` occurs; work is confined to editing and deleting existing TypeScript source in already-installed packages.

## Architecture Patterns

### System Architecture Diagram

```
                       packages/model (@packpixie/model)
                       ┌───────────────────────────────────┐
   edit ──────────────►│  src/status.ts                     │
                       │  src/trip.ts                        │
   ADD  ──────────────►│  src/item.ts   (Item, ItemStatus,  │
                       │                 TripDetailResponse) │
   DELETE ────────────►│  src/comment.ts  ✗                 │
                       │  src/index.ts  (barrel: + item,     │
                       │                  − comment)         │
                       └──────────────┬────────────────────┘
                                      │  tsc build → dist/*.d.ts + dist/*.js
                                      │  (^build runs FIRST via Turbo)
                          ┌───────────┴────────────┐
                          ▼                          ▼
              apps/api (Fastify)          apps/client (React SPA)
              ┌────────────────────┐      ┌──────────────────────────┐
   DELETE ───►│ routes/api.ts       │      │ Comments.tsx        ✗    │◄─── DELETE (file)
              │  GET /comments   ✗  │      │ App.tsx  (import+usage)✗ │◄─── DELETE (lines 6,54)
              │  POST /comments  ✗  │      │ api/api.ts               │
              │  imports (model)    │      │  getComments/postComment✗│◄─── DELETE
   import ───►│  Item/TripDetail?   │      │  TripComment import   ✗  │
              │  (SC#2 — see Q1)    │      │  Item/TripDetail? (SC#2) │◄─── import (SC#2 — see Q1)
              └────────────────────┘      └──────────────────────────┘
                          │  pnpm type-check (dependsOn ^build) → both green
                          ▼
                    pnpm build green, nothing unused left behind
```

### Recommended Project Structure
```
packages/model/src/
├── index.ts     # barrel: export * from './status.js' | './trip.js' | './item.js'  (comment.js removed)
├── status.ts    # StatusResponse, DBStatus  (unchanged)
├── trip.ts      # Trip, CreateTripRequest, ... (unchanged; template for Item)
└── item.ts      # NEW: ItemStatus, Item, TripDetailResponse
```

### Pattern 1: Shared DTO mirrors `Trip`
**What:** Plain `export interface` / `export type` with camelCase, ISO-string dates. No classes, no runtime code.
**When to use:** Every shared type in `@packpixie/model`.
**Example:**
```ts
// Source: packages/model/src/trip.ts:1-6 [VERIFIED]
export interface Trip {
  tripId: string;
  tripName: string;
  createdAt: string;
  participants: string[];
}
```
Note the barrel uses `.js` extensions in re-exports even for `.ts` source (ESM):
```ts
// Source: packages/model/src/index.ts:1-3 [VERIFIED]
export * from './status.js';
export * from './trip.js';
export * from './comment.js';   // ← this line is REMOVED
```

### Anti-Patterns to Avoid
- **Adding `'unset'` to `ItemStatus`:** D-04 forbids it — unset status is an absent field, not a sentinel value.
- **Using `qty`/`null`/`""`:** D-01 says `quantity` (full word); D-04 says never store `null`/empty for optionals.
- **Leaking DynamoDB keys into the DTO:** D-06 — no `PK`/`SK`/`GSI*` in the contract.
- **Adding an artificial dead import solely to satisfy SC#2:** violates the CLAUDE.md "leave nothing unused behind" rule — see Open Questions Q1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-package type sharing | Duplicate interfaces in each app | `@packpixie/model` shared package | Single source of truth already exists [VERIFIED: apps/client/src/api/api.ts:1-7 imports from `@packpixie/model`] |
| Finding all dead-code references | Manual memory | `grep -rn` + `pnpm type-check` + `pnpm build` | The compiler is the exhaustive dangling-reference detector for this phase |

**Key insight:** This phase's "verification" is the toolchain itself. There is no custom logic to build; correctness == green `type-check` + `build` with no leftover references.

## Runtime State Inventory

This is a refactor/deletion phase (MODEL-02), so the following was inventoried explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | DynamoDB `COMMENTS` partition (`PK: 'COMMENTS'`) [VERIFIED: apps/api/src/routes/api.ts:104,134]. Records may exist in DynamoDB Local and/or prod. | **None** — D-09 mandates no data migration; the partition is self-contained and simply stops being read/written. Orphaned records are harmless. |
| **Live service config** | None. Comments were an internal API route + DynamoDB partition; no external service (dashboard, workflow, ACL) references them. | None — verified: only in-repo code references found. |
| **OS-registered state** | None. No scheduled tasks, pm2 process names, or systemd units reference comments. | None — verified: no such registrations in repo. |
| **Secrets/env vars** | None. No secret key or env var references comments (grep found only source `.ts`/`.tsx` and build `dist` artifacts). | None. |
| **Build artifacts / installed packages** | `packages/model/dist/comment.d.ts` and its `export * from './comment.js'` in `dist/index.d.ts` [VERIFIED: grep hit `packages/model/dist/comment.d.ts:1` and `dist/index.d.ts:3`]. `package.json` `main`/`types` point at `dist/` [VERIFIED: packages/model/package.json main=`dist/index.js`, types=`dist/index.d.ts`]. | **Rebuild the model package** after deleting source (`tsc` regenerates `dist/`), or run `pnpm clean` first. A stale `dist/comment.d.ts` would keep the type resolvable and mask an incomplete removal. |

**Exact Comments removal surface (all 5 source sites — verified this session):**

| # | File | What to remove | Verified at |
|---|------|----------------|-------------|
| 1 | `apps/api/src/routes/api.ts` | `GET /comments` + `POST /comments` protected handlers (the whole `COMMENTS` query/put blocks) | lines 99-143 |
| 2 | `apps/client/src/Comments.tsx` | Delete the entire file | full file (133 lines) |
| 3 | `apps/client/src/App.tsx` | `import Comments from './Comments';` (line 6) and `<Comments />` (line 54) | lines 6, 54 |
| 4 | `apps/client/src/api/api.ts` | `getComments` (39-47) + `postComment` (49-60) functions; and `TripComment`, `GetCommentsResponse` from the import block (lines 5-6) | lines 5-6, 39-60 |
| 5 | `packages/model/src/comment.ts` + `index.ts` | Delete `comment.ts`; remove `export * from './comment.js';` | comment.ts full file; index.ts:3 |

**No comment references exist outside these sites** — verified by `grep -rni comment` across `apps` and `packages`: the only other hits are the `dist/` build artifacts (row above) and the e2e tests contain **zero** comment references (`apps/e2e/tests/{auth,trip}.spec.ts`).

## Common Pitfalls

### Pitfall 1: Type-check passes on stale model `dist/` and hides an incomplete removal
**What goes wrong:** Apps import `@packpixie/model`, which resolves to `dist/index.d.ts` (not `src/`). If `comment.ts` is deleted from `src/` but the model isn't rebuilt, `dist/comment.d.ts` still exists and `TripComment` stays resolvable — so a forgotten importer wouldn't error.
**Why it happens:** `package.json` `types: "dist/index.d.ts"` [VERIFIED] and Turbo `type-check dependsOn ["^build"]` [VERIFIED: turbo.json] — the app type-check triggers a model build, but a manually run `tsc` in an app without going through Turbo could read stale output.
**How to avoid:** Always verify via the root scripts (`pnpm type-check`, `pnpm build`) which go through Turbo; optionally `pnpm clean` first to force a fresh `dist/`.
**Warning signs:** `TripComment` still importable after you deleted `comment.ts`.

### Pitfall 2: Build ordering — apps compiled before model
**What goes wrong:** New `Item`/`TripDetailResponse` types not visible to apps.
**Why it happens:** Model must build first so its `dist/*.d.ts` reflects `item.ts`.
**How to avoid:** Turbo's `^build` dependency handles this automatically for `pnpm build` and `pnpm type-check` [VERIFIED: turbo.json build/type-check both declare the dependency]. Do not bypass Turbo.
**Warning signs:** "Cannot find name 'Item'" in an app that imported it.

### Pitfall 3: Partial import-line edit leaves a dangling named import
**What goes wrong:** Removing `getComments`/`postComment` from `apps/client/src/api/api.ts` but leaving `TripComment`/`GetCommentsResponse` in the import block (or vice versa) → unused-import / unresolved-type error.
**Why it happens:** The import block at lines 1-7 mixes still-needed types (`StatusResponse`, `CreateTripResponse`, `GetTripsResponse`) with the two to remove.
**How to avoid:** Edit the import block to keep exactly the three still-used types; remove `TripComment`, `GetCommentsResponse` [VERIFIED: apps/client/src/api/api.ts:1-7].
**Warning signs:** Lint/type-check error for unused import or missing type.

### Pitfall 4: SC#2 vs "leave nothing unused behind"
**What goes wrong:** Adding a token import of `Item`/`TripDetailResponse` in an app just to satisfy "both apps import the new types," creating dead code that violates CLAUDE.md.
**How to avoid:** See Open Questions Q1 — resolve the intent before planning tasks.

## Code Examples

### The `item.ts` file to create (implement verbatim from D-02/D-06)
```ts
// Source: CONTEXT.md D-02 + D-06 (locked); shape mirrors packages/model/src/trip.ts [VERIFIED]
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

### The barrel after editing
```ts
// Source: derived from packages/model/src/index.ts:1-3 [VERIFIED]
export * from './status.js';
export * from './trip.js';
export * from './item.js';   // added
// './comment.js' removed
```

## State of the Art

Not applicable — no evolving external ecosystem is involved. The relevant "state of the art" is the project's own established conventions:

| Old Approach | Current Approach | Where | Impact |
|--------------|------------------|-------|--------|
| PascalCase DynamoDB attrs surfaced directly | camelCase DTOs with a mapping layer | `Trip` today [VERIFIED: trip.ts vs dynamoDB-architecture.md §2] | `Item` follows the same split (D-01) |
| `dynamoDB-architecture.md` says `PackedBy` = `<UserId>` | Identity is lowercased **email** | Corrected in Phase 6; D-05 | `packedBy` typed as `string` (email) |

**Deprecated/outdated:**
- The Comments scaffold: dead demo code, removed entirely (MODEL-02).
- `<UserId>` references in `dynamoDB-architecture.md` §3 and `app-architecture.md` §5.2 are stale; email is authoritative (flagged in CONTEXT canonical_refs; correction is a Phase 6 concern, not Phase 5).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SC#2's literal "both apps import the new types" is best satisfied by deferring the actual import to consuming phases (6/8) rather than adding dead token imports, given the "leave nothing unused behind" rule. | Open Questions Q1 | If the roadmap truly requires the import in Phase 5, an approach that defers it would fail SC#2 review. Low code risk; needs a one-line intent confirmation. |

Everything else in this research is `[VERIFIED]` from files read this session.

## Open Questions

1. **How is SC#2 ("both `apps/api` and `apps/client` import the new types") satisfied in Phase 5, given no app has a real consumer until Phases 6/8?**
   - What we know: Neither app currently imports `Item`/`TripDetailResponse` [VERIFIED: apps/api/src/routes/api.ts:9-15 imports only Status/Trip types; apps/client/src/api/api.ts:1-7 likewise]. CLAUDE.md forbids leaving unused code. The roadmap SC and MODEL-01 both use the word "consumed by both".
   - What's unclear: Whether the roadmap intends a literal import in this phase or accepts satisfaction when Phases 6/8 wire them.
   - Recommendation: Do **not** add artificial dead imports. Present the planner two clean options and pick one before writing tasks: **(a)** interpret SC#2 as met once the model package builds and both apps' `type-check` passes against the updated `@packpixie/model` (they already depend on it), deferring real imports to Phases 6/8; or **(b)** if a literal import is required, have `apps/api` type its (future) route handler return as `TripDetailResponse` and `apps/client/src/api/api.ts` add a real `getTripDetail(tripId): Promise<TripDetailResponse>` stub that will be used in Phase 6/8 — a genuine, soon-used consumer rather than dead code. Option (b) risks bleeding Phase 6/8 scope into Phase 5. Confirm intent with the roadmap owner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Workspace / all scripts | ✓ (pinned) | 10.12.1 | — |
| Turbo | `build` / `type-check` orchestration | ✓ | ^2.5.6 | — |
| TypeScript | model build + type-check | ✓ | ^5.9.2 | — |

All required tooling is already present (the repo builds today). No external services (DynamoDB, Cognito, network) are exercised by this phase — it is compile-time only.

## Validation Architecture

*(nyquist_validation is enabled — `workflow.nyquist_validation: true` [VERIFIED: .planning/config.json])*

### Test Framework
| Property | Value |
|----------|-------|
| Framework | No unit-test framework in `packages/model` (build script is `tsc` only [VERIFIED: packages/model/package.json scripts]). Repo-wide `turbo run test`; e2e via Playwright (`apps/e2e/tests/`). |
| Config file | `turbo.json` (task graph); model `tsconfig.json` |
| Quick run command | `pnpm type-check` |
| Full suite command | `pnpm build && pnpm type-check` (this phase's true gate) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODEL-01 | `Item` + `TripDetailResponse` exist, compile, and are importable across the monorepo | compile / type-check | `pnpm build && pnpm type-check` | ✅ (toolchain) |
| MODEL-02 | Comments scaffold fully removed, no dangling references, build green | compile / build | `pnpm build && pnpm type-check` | ✅ (toolchain) |
| MODEL-02 | No stray `comment` reference remains in source | grep gate | `grep -rni comment apps packages --include='*.ts' --include='*.tsx' \| grep -v node_modules \| grep -v /dist/` returns empty | ✅ |

### Sampling Rate
- **Per task commit:** `pnpm type-check`
- **Per wave merge:** `pnpm build && pnpm type-check`
- **Phase gate:** `pnpm build` green + the grep gate empty (`dist` excluded, or after a clean rebuild) before `/gsd-verify-work`.

### Wave 0 Gaps
- None required. This is a types-and-deletion phase; the TypeScript compiler and `build` are the natural, sufficient validators. Introducing a unit-test runner (jest/vitest) solely to assert type shapes would be over-engineering — type-level correctness is already enforced at compile time. The existing Playwright e2e suite is untouched by this phase.

## Security Domain

*(security_enforcement is enabled, ASVS level 1 [VERIFIED: .planning/config.json])*

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth code changed. Comment routes were in the protected scope; removing them only shrinks surface. |
| V3 Session Management | no | Untouched. |
| V4 Access Control | no | No access-control logic added/changed (participation guard is Phase 6). |
| V5 Input Validation | no | This phase declares types and deletes code — no request-handling logic added. Item write validation is Phase 7. |
| V6 Cryptography | no | None. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Removing a route leaves an orphaned client caller | (reliability, not security) | Grep gate + type-check catch dangling callers [covered in Common Pitfalls #3] |
| Orphaned `COMMENTS` DynamoDB records | Information disclosure (negligible — self-contained demo data) | Accepted per D-09 (no migration); records are unreachable once routes are gone |

**Net effect:** This phase **reduces** attack surface (removes two protected endpoints) and introduces no new runtime code paths. No security controls to add; no threats introduced.

## Sources

### Primary (HIGH confidence — read this session)
- `packages/model/src/trip.ts` (lines 1-21) — `Trip` DTO template, camelCase convention
- `packages/model/src/index.ts` (lines 1-3) — barrel export pattern
- `packages/model/src/comment.ts` (lines 1-9) — model to delete
- `packages/model/src/status.ts` — sibling convention
- `packages/model/package.json`, `packages/model/tsconfig.json` — build via `tsc` to `dist/`, `main`/`types` point at `dist/`
- `apps/api/src/routes/api.ts` (lines 1-289) — Comments handlers (99-143), model imports (9-15)
- `apps/client/src/App.tsx` (lines 6, 54) — Comments import + usage
- `apps/client/src/api/api.ts` (lines 1-60) — comment API functions + imports
- `apps/client/src/Comments.tsx` — component to delete
- `turbo.json`, root `package.json` — task graph (`type-check`/`build` `dependsOn ^build`), scripts
- `dynamoDB-architecture.md` §2-§5 — item storage attributes, `Status` value set, stale `<UserId>` note
- `.planning/config.json` — nyquist_validation + security_enforcement flags
- grep audit across `apps`/`packages` for `comment` — exhaustive removal surface
- `apps/e2e/tests/` listing — no comment references in e2e

### Secondary (MEDIUM confidence)
- None needed.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; existing toolchain read directly from package.json/turbo.json.
- Architecture: HIGH — contract is locked (D-02/D-06) and mirrors verified `Trip`.
- Pitfalls: HIGH — build-ordering and dist-staleness verified against turbo.json + model package.json; removal surface verified by grep + file reads.
- Open question (SC#2 intent): MEDIUM — needs a one-line roadmap-intent confirmation before planning.

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 (stable — in-repo, no fast-moving external dependencies)
