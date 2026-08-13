---
created: 2026-08-13T17:09:21.505Z
title: Paginate GET /trips/:tripId query so the participation guard cannot be truncated
area: api
severity: blocker
source: [06-REVIEW.md]
files:
  - apps/api/src/routes/api.ts:248-289
  - apps/api/src/lib/tripDetail.ts:14-19
  - dynamoDB-architecture.md:33-34
---

## Problem

Deferred from Phase 6 code review (CR-01). Accepted as MVP-scoped: at MVP-scale
trips (a handful of participants, dozens of items) the DynamoDB partition never
approaches the 1 MB page limit, so the bug does not manifest today. Recorded here
because it is a latent correctness defect in a security-critical guard.

**CR-01 (blocker):** `GET /trips/:tripId` (api.ts:248-256) issues a single
`QueryCommand` and reads only `result.Items ?? []` — it never drains
`LastEvaluatedKey`. DynamoDB returns partition items in ascending SK order, and the
SK prefixes sort `ITEM# (73) < META# (77) < USER# (85)`. The `USER#<email>`
participant records the guard depends on sort **last**, so once a trip partition
exceeds the 1 MB page limit those records are the first to be truncated onto an
unfetched page. Effect: a legitimate member's own `USER#` record is missing from the
first page, `isMember` returns `false`, and the member is denied their own trip with
a spurious 404 — a functional break of the security guard. The success path would
also return an empty `tripName` and truncated `participants`/`items`. No
`ProjectionExpression` is set (correct — `Name`/`Status` are reserved words), so full
item records are fetched and the 1 MB ceiling is reached sooner.

Note: Phase 6's plan deliberately mandated "exactly ONE QueryCommand"; fixing this is
a conscious deviation from that locked design constraint, hence deferred rather than
patched inline.

## Companion findings from the same review (address alongside if convenient)

- **WR-01 (warning)** `tripDetail.ts:14-19` — required `Item` fields are produced via
  unchecked `as` casts; a malformed `ITEM#` record silently ships `undefined` typed as
  `string`/`number`, and a missing `SK` throws a 500.
- **WR-02 (warning)** `api.ts:246` — `request.user.email.trim()` assumes the `email`
  claim exists; a verified token without an `email` claim crashes with a 500. Best
  fixed once in `apps/api/src/plugins/auth.ts`.
- **IN-01 (info)** participant-extraction logic is duplicated between `GET /trips` and
  `GET /trips/:tripId` — candidate for a shared helper.
- **IN-02 (info)** `dynamoDB-architecture.md:33-34` — `Carried`/`UsedBy` still
  reference `<UserId>` and `user_123` examples, contradicting the email-identity
  correction made in the same phase (Phase 6, plan 06-02 intentionally left the
  deferred Distribution features' `<UserId>` bodies in place, but the `user_123`
  example reads as current).

## Solution

Replace the single query with a pagination loop that accumulates `Items` while
`LastEvaluatedKey` is set (passing it back as `ExclusiveStartKey`), then run the
existing membership/partition logic over the full record set. Consider addressing
WR-02 in `auth.ts` at the same time. Full report: `.planning/phases/06-trip-detail-read-api-participation-guard/06-REVIEW.md`.
