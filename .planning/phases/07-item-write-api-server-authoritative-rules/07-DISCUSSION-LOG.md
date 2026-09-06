# Phase 7: Item Write API & Server-Authoritative Rules — Discussion Log

**Date:** 2026-09-04

This log is for human reference only; downstream agents read `07-CONTEXT.md`, not this file.

## Endpoint shape & routing
- **Routes:** Chose REST-ish `POST /trips/:tripId/items`, `PATCH /trips/:tripId/items/:itemId`, `DELETE /trips/:tripId/items/:itemId` over a split status-only endpoint. Rationale: matches how an inline-edit table will likely save a whole row at once.
- **Item id scheme:** Chose `crypto.randomUUID()` over ULID. Rationale: built-in, no dependency; sortability not currently needed.

## Validation & error responses
- **Error shape:** Chose 400 with a specific structured `{ error: '<message>' }` body per violated rule, over a generic message + machine code.
- **PackedBy validation:** Must reference an actual trip participant (checked against `USER#` records) — chosen over accepting any value.
- **Unknown fields:** PATCH rejects unknown/extra fields with 400 — chosen over silently ignoring them.

## Concurrency & atomicity
- **Atomic clear:** Chose read-then-write (fetch current item, compute resulting fields, single UpdateItem) over a computed-conditional-update-without-read approach. Note: this has a small read/write race window, accepted given the next decision.
- **Concurrent edits:** Chose last-write-wins, no version/conflict detection, over optimistic concurrency (409s). Rationale: matches PROJECT.md's "shared editing, cheap correctness rules" model; low-stakes collaborative list doesn't need locking.

## Delete semantics
- **Delete type:** Chose hard delete over soft delete/tombstone. Rationale: no undo/audit requirement exists yet.
- **Delete restriction:** Chose to restrict deleting already-packed items (must unpack first) — this was a deviation from the initial recommendation ("any participant, any status"), added as a guard rail.
- **Delete-packed error:** Chose 400 with a clear message over 409 (this codebase doesn't use 409 elsewhere).

## Deferred Ideas
- UI wiring, filters, E2E coverage — all already scoped to Phases 8–10 per the roadmap; reaffirmed as out of scope here, no new scope creep raised.

---

*Phase: 7-Item Write API & Server-Authoritative Rules*
*Discussion logged: 2026-09-04*
