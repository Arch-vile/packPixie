# Phase 5: Shared Item Model & Comments Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 5-Shared Item Model & Comments Cleanup
**Areas discussed:** Field naming, Contract scope, Ordering field, Unset representation

---

## Field naming for the `Item` TS type

| Option | Description | Selected |
|--------|-------------|----------|
| camelCase + full words | `name`, `quantity`, `weight`, `packedBy`, `status`, `category`, `consumable`. Matches the existing `Trip` DTO; needs a PascalCase mapping layer in persistence. | ✓ |
| PascalCase (mirror DynamoDB) | `Name`, `Qty`, `Weight`, ... maps 1:1 to stored attributes but breaks `Trip` consistency and leaks storage naming. | |

**User's choice:** camelCase + full words (recommended)
**Notes:** Consistent with the existing `Trip` DTO. `quantity` spelled out, not `qty`.

---

## Contract scope for Phase 5

| Option | Description | Selected |
|--------|-------------|----------|
| Read contract only | `Item`, `ItemStatus`, `TripDetailResponse` only. Write request DTOs deferred to Phase 7. | ✓ |
| Also define write request DTOs now | Add `CreateItemRequest` / `UpdateItemRequest` in Phase 5 so all model changes land together. | |

**User's choice:** Read contract only (recommended)
**Notes:** Matches MODEL-01 and the roadmap success criteria exactly; keeps the phase minimal.

---

## Ordering field (`createdAt`) on `Item`

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 7 | `Item` = itemId + packing attrs; Phase 7 adds `createdAt` if needed. | |
| Include `createdAt` now | Add `createdAt: string` to the contract in Phase 5; Phase 7 just populates it. | ✓ |

**User's choice:** Include `createdAt` now (deviated from the recommended "defer")
**Notes:** Bakes stable ordering into the type from day one (PITFALLS #11). Schemaless, so zero cost to include early.

---

## Unset representation (`status` / `weight` / `packedBy`)

| Option | Description | Selected |
|--------|-------------|----------|
| Optional fields | `status?`, `weight?`, `packedBy?` — absence = unset, mirrors DynamoDB "omit the attribute". `ItemStatus = 'to-buy' \| 'found' \| 'packed'`. | ✓ |
| Explicit null / 'unset' | `status: ItemStatus \| null` with an `'unset'` member and nullable weight/packedBy. | |

**User's choice:** Optional fields (recommended)
**Notes:** Aligns the type with the `attribute_exists(...)` storage semantics Phase 7 relies on; never store `null`/`""`.

---

## Claude's Discretion

- File layout inside `packages/model/src` (new `item.ts` vs extending `trip.ts`) — follow the existing one-concept-per-file convention.
- Where `TripDetailResponse` lives (`item.ts` vs `trip.ts`) — spans both concepts; planner's call.

## Deferred Ideas

- Write request DTOs (`CreateItemRequest` / `UpdateItemRequest`) → Phase 7.
- `createdAt` population + item id/sort strategy → Phase 7.
- `PackedBy`-is-a-member validation → Phase 7.
- Internal-key stripping in the mapped response → Phase 6.
- `UsedBy` / `Carried` / Distribution → v2.x milestone.
