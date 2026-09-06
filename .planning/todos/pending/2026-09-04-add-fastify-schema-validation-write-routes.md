---
created: 2026-09-04T15:40:00.000Z
title: Add Fastify schema.body validation to item/trip write routes
area: api
severity: warning
source: [07-REVIEW.md, 07-REVIEW-FIX.md]
files:
  - apps/api/src/routes/api.ts
---

## Problem

Deferred from Phase 7 code review (WR-02). None of the write routes
(`POST /trips`, `POST /trips/:tripId/items`, `PATCH /trips/:tripId/items/:itemId`,
`DELETE /trips/:tripId/items/:itemId`) register a Fastify `schema.body`, so all runtime
input validation depends entirely on hand-written `typeof`/optional-chaining checks in
`tripDetail.ts` and inline route code. CR-02 (fixed in 07-REVIEW-FIX.md) closed the
concrete crash this allowed — malformed JSON reaching `.trim()` — but the underlying gap
(no schema-level first line of defense) remains: it's easy for a future field addition to
regress the same way.

## Solution

Add a JSON schema (`schema: { body: { type: 'object', properties: {...},
additionalProperties: false } }`) to each write route, in addition to (not instead of) the
existing business-rule checks in `tripDetail.ts`. Full report:
`.planning/phases/07-item-write-api-server-authoritative-rules/07-REVIEW.md`.
