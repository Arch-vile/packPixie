# Phase 6: Trip-Detail Read API & Participation Guard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 6-Trip-Detail Read API & Participation Guard
**Areas discussed:** None interactively — user delegated all gray areas to Claude ("No need to discuss anything now")

---

## Session summary

Four gray areas were surfaced for the user to select from. The user chose not to discuss any of them and delegated the decisions. Each was resolved with a sensible default grounded in the Phase 5 contract, the existing `apps/api` code, and `dynamoDB-architecture.md`, and recorded as a locked decision (D-01…D-10) in CONTEXT.md.

## Gray areas surfaced (not discussed)

| Area | Options presented | Resolution (Claude) |
|------|-------------------|---------------------|
| Guard & single-query strategy | Derive membership from the one `Query PK=TRIP#tripId` result vs a separate guard `GetItem` | Single query; membership derived from the same result set (D-01, D-02) |
| 404 response shape | Empty body vs `{ error: 'Trip not found' }`; identical message for foreign vs missing | `{ error: 'Trip not found' }`, one identical response for both cases (D-03) |
| Item attribute mapping | Storage attribute names, mapper location, empty-items handling | Explicit field-by-field mapper per `dynamoDB-architecture.md`; empty `items: []` is normal (D-04, D-05, D-06) |
| Doc-correction scope | Only `dynamoDB-architecture.md` identity refs vs also `app-architecture.md §5` (a stale multi-table schema) | Correct `dynamoDB-architecture.md` identity refs; add a "superseded" banner to `app-architecture.md §5` (D-07, D-08) |

## Claude's Discretion

- Exact file location of the item mapper (inline vs a reusable `apps/api/src/lib/tripDetail.ts` module).
- Whether guard/shape logic is one handler or split into helpers.
- Exact wording of the `app-architecture.md §5` doc banner, and the option of a narrower §5.2-only identity edit instead.
- Whether to add a `@packpixie/model` import touchpoint on the API side now.

## Deferred Ideas

- Item writes and server-authoritative rules → Phase 7.
- Trip-detail UI table + client fetch → Phase 8.
- `PackedBy = me` default view, status filter, show-all toggle → Phase 9.
- E2E coverage of the read endpoint + participation guard → Phase 10.
- `UsedBy` / `Carried` / Distribution identity → v2.x milestone.
