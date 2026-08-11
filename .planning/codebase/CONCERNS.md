# Codebase Concerns

**Analysis Date:** 2026-06-27

## Tech Debt

**Debug logging left in production entry point:**
- Issue: `apps/api/src/index.ts` (lines 11–14) emits a massive `XXXXX…` banner and `process.env.NODE_ENV` via `console.log` on every Lambda cold start and warm invocation. This pollutes CloudWatch logs and signals uncommitted dev state.
- Files: `apps/api/src/index.ts`
- Impact: CloudWatch log costs increase; logs become noisy and harder to search; reviewer confidence drops.
- Fix approach: Remove both `console.log` calls. Fastify's built-in structured logger already logs startup info.

**Config management marked TODO:**
- Issue: `apps/api/src/config.ts` line 1 reads `// TODO: use real config management (e.g. dotenv, config files, etc.)`. The builder pattern works but has no defaults, no validation beyond "truthy", and no documentation of required vars.
- Files: `apps/api/src/config.ts`
- Impact: Missing env vars crash the Lambda cold start with an uncaught `Error` thrown inside the builder, producing an opaque 502 from API Gateway.
- Fix approach: Add env var names to the error message; resolve the TODO once the config strategy is settled.

**Comments feature is scaffolding that was never removed:**
- Issue: `GET /api/comments` and `POST /api/comments` are fully implemented in the API and UI but are not part of the product spec. They store comments under a flat `PK: 'COMMENTS'` key, completely outside the trip-scoped data model. The `Comments` component renders in `App.tsx` alongside `StatusChecker` for all authenticated users.
- Files: `apps/api/src/routes/api.ts` (lines 99–148), `apps/client/src/Comments.tsx`, `apps/client/src/App.tsx`
- Impact: Wastes DynamoDB capacity, increases Lambda bundle size, exposes an unintended multi-user write surface, and clutters the UI.
- Fix approach: Remove `Comments` component from `App.tsx`, delete `Comments.tsx`, and delete both comment route handlers from `api.ts`.

**`StatusChecker` debug component shipped in production:**
- Issue: `StatusChecker` renders a manual "Check API Status" button inside `AppContent` (`apps/client/src/App.tsx`). It duplicates the `ApiConnectionStatus` header and exists only as a developer tool.
- Files: `apps/client/src/App.tsx`, `apps/client/src/StatusChecker.tsx`
- Impact: Clutters the UI; fires an unauthenticated `/api/status` request on every button click.
- Fix approach: Remove `StatusChecker` from `AppContent`. Keep `ApiConnectionStatus` in the header.

**Empty `api-deploy/routes/` directory:**
- Issue: `api-deploy/routes/` exists at the workspace root and is empty. It may be a leftover deployment artifact directory.
- Files: `api-deploy/`
- Impact: Ambiguity about whether this is intentional; new contributors may add files here instead of `apps/api/src/routes/`.
- Fix approach: Delete or document the directory's purpose.

---

## Known Bugs

**CORS locked to placeholder domain in production:**
- Symptoms: All browser requests from the real CloudFront domain are blocked in production with a CORS error.
- Files: `apps/api/src/index.ts` (line 38)
- Trigger: Any API call from the deployed frontend.
- Code: `origin: process.env.NODE_ENV === 'production' ? ['https://your-domain.com'] : true`
- Workaround: None. This must be replaced with the actual CloudFront domain before production use.

**`BatchWriteCommand` does not handle `UnprocessedItems`:**
- Symptoms: When DynamoDB throttles during trip creation, some invited participants are silently dropped. The API returns `201` but the invite is incomplete.
- Files: `apps/api/src/routes/api.ts` (lines 205–224)
- Trigger: Trip created with many participants (>25) under sustained write load, or at provisioned-capacity throttle thresholds.
- Workaround: None — the failure is silent and no retry logic exists.

**`alert()` called on missing env vars in client:**
- Symptoms: `alert()` blocks rendering if any `VITE_*` env var is absent, causing a blank page on misconfigured deployments.
- Files: `apps/client/src/config.ts` (line 6)
- Trigger: Missing `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, etc. at build time.
- Workaround: Ensure all env vars are set; the `alert` gives minimal debugging context.

---

## Security Considerations

**No trip-level authorization on any route:**
- Risk: The architecture doc specifies "Verify caller is a TripMember for the trip" as a required AuthZ step, but no route performs this check. Any authenticated user can read data from trips they do not belong to if they know the `tripId`.
- Files: `apps/api/src/routes/api.ts` (all protected routes), `apps/api/src/plugins/auth.ts`
- Current mitigation: `GET /trips` is scoped by user email via GSI1, so the listing is safe. Individual trip resource routes (snapshot, row updates) are not yet implemented — the missing check must be added before those routes are built.
- Recommendations: Before implementing any per-trip resource endpoint, add a DynamoDB `GetItem` check that `TRIP#<tripId> / USER#<email>` exists and return 403 if not.

**No schema validation on `POST /api/comments` body:**
- Risk: The route casts `request.body as { text?: string }` without registering a Fastify JSON schema. Malformed, oversized, or unexpected payloads are accepted and written to DynamoDB.
- Files: `apps/api/src/routes/api.ts` (line 119)
- Current mitigation: `text?.trim()` strips leading/trailing whitespace and rejects empty strings, but length is unbounded.
- Recommendations: Add a Fastify `schema.body` with `maxLength` on `text`. Apply the same pattern to all POST routes.

**No email format validation on `participantEmails`:**
- Risk: `POST /api/trips` accepts any string as a participant email — only trimming, lowercasing, and deduplication are applied. Garbage values are written to DynamoDB as `USER#<garbage>` participant records.
- Files: `apps/api/src/routes/api.ts` (line 199), `apps/client/src/TripList.tsx` (`addEmail()` function)
- Current mitigation: Client-side TripList.tsx deduplicates and lowercases but does not validate email format.
- Recommendations: Add a Fastify schema that validates each entry in `participantEmails` as `format: "email"` (requires `ajv-formats`), and add client-side regex validation in `addEmail()`.

**IAM policy grants `dynamodb:Scan`:**
- Risk: The Lambda execution role is authorized to run full-table scans on the DynamoDB table. No application code uses `Scan`, making this permission purely unnecessary and potentially dangerous if exploited.
- Files: `infra/dynamodb.tf` (line ~63)
- Current mitigation: None — the permission is live.
- Recommendations: Remove `dynamodb:Scan` from the IAM policy. The single-table design is fully served by `Query` and `GetItem`.

**CORS open in non-production environments (`true`):**
- Risk: `origin: true` reflects the request `Origin` header as allowed, permitting any domain to make credentialed requests to the local/staging API.
- Files: `apps/api/src/index.ts` (line 38)
- Current mitigation: Acceptable for local dev but should be locked to a staging domain for any shared environment.
- Recommendations: Use an explicit allowlist per environment.

---

## Performance Bottlenecks

**N+1 DynamoDB queries in `GET /trips`:**
- Problem: Fetching a user's trip list requires 1 GSI1 query to get trip IDs, then 1 additional `QueryCommand` per trip to load participants. A user with 10 trips fires 11 DynamoDB requests on every dashboard load.
- Files: `apps/api/src/routes/api.ts` (lines 243–280)
- Cause: Participant emails are not denormalized onto the GSI1 result; a secondary query per trip is needed.
- Improvement path: Denormalize participant list onto the trip's GSI1 record, or switch to a `ProjectionExpression` batch approach. Alternatively, strip the per-trip participant fetch from the dashboard response and load it lazily per trip.

**`DescribeTableCommand` on every `/api/status` call:**
- Problem: The status endpoint issues a `DescribeTableCommand` on every request to check DynamoDB connectivity. This is an expensive control-plane call.
- Files: `apps/api/src/routes/api.ts` (`checkDynamoDB` function, line 35–55)
- Cause: No caching or TTL on the result.
- Improvement path: Cache the result for 30–60 seconds in module scope, or use a lightweight `GetItem` on a known key instead.

---

## Fragile Areas

**Single monolithic route file:**
- Files: `apps/api/src/routes/api.ts` (289 lines)
- Why fragile: All public routes, protected routes, DynamoDB helpers, and business logic are in a single file. Adding new routes requires understanding the entire nesting structure of Fastify `register` calls.
- Safe modification: New route groups should be extracted into separate files and registered via `fastify.register()` from `api.ts`. Follow the existing `authPlugin` pattern for cross-route hooks.
- Test coverage: None — changes cannot be validated without manual integration testing.

**Fastify nested `register` structure for auth scope:**
- Files: `apps/api/src/routes/api.ts` (lines 70–285)
- Why fragile: The protected routes sit inside a triple-nested anonymous async function. The `fastify-plugin` wrapper on `authPlugin` is required to share decorators across the nested scope — removing it silently breaks `request.user`.
- Safe modification: Do not unwrap `authPlugin` from `fp()`. Understand that `fastify-plugin` bypasses encapsulation before touching auth-adjacent code.
- Test coverage: None.

**Trips fetch on `userEmail` change only:**
- Files: `apps/client/src/App.tsx` (lines 33–36)
- Why fragile: `getTrips()` is fetched once on mount and never refreshed. After `createTrip()` in `TripList`, the list is re-fetched inside the component via a direct `getTrips()` call and lifted via `onTripsChange`. If trip creation fails mid-way, the list state is stale.
- Safe modification: Any new mutation that changes the trip list must explicitly call `getTrips()` and update state via `onTripsChange`.

---

## Scaling Limits

**Lambda cold-start latency:**
- Current capacity: Single Lambda; `aws-jwt-verify` fetches JWKS from Cognito on first verification and caches in-memory across warm invocations.
- Limit: High-traffic bursts clear warm instances, causing JWKS re-fetch and a cold start penalty. Memory is set to 256 MB.
- Scaling path: Increase Lambda memory (also increases CPU allocation); enable provisioned concurrency for baseline warm instances; JWKS caching is already in place.

**DynamoDB on-demand billing with no read/write caps:**
- Current capacity: PAY_PER_REQUEST with no reserved capacity.
- Limit: No throttle protection on the client side or server side. A runaway client (bug or attack) can drive unbounded DynamoDB costs.
- Scaling path: Add application-level rate limiting (e.g., `@fastify/rate-limit`) per user; consider DynamoDB reserved capacity once traffic is predictable.

---

## Missing Critical Features

**No polling / real-time sync endpoint:**
- Problem: The architecture specifies `GET /trips/:tripId/changes?since=...` for collaborative sync. This endpoint does not exist. Multiple users editing simultaneously will not see each other's changes without a page reload.
- Blocks: Collaborative packing workflow — the core product use case.

**No trip snapshot endpoint:**
- Problem: The architecture specifies `GET /trips/:tripId/snapshot` as the primary trip-workspace loader. It is not implemented. The frontend has no way to load trip items.
- Blocks: All packing, distribution, and summary views.

**No row CRUD or optimistic locking:**
- Problem: The architecture specifies `PATCH /trips/:tripId/rows/:rowId` with conditional DynamoDB expressions for per-row concurrency. No item/row routes exist.
- Blocks: Any actual trip packing functionality.

**No invite / participant join flow:**
- Problem: `participantEmails` are written to DynamoDB at trip creation, but there is no join link, accept flow, or way for an invited participant to claim their record.
- Blocks: Collaborative trip participation for non-creator users.

---

## Test Coverage Gaps

**Zero automated tests across the entire codebase:**
- What's not tested: All API routes, DynamoDB interaction, JWT verification, React components, trip creation flow.
- Files: All files under `apps/api/src/`, `apps/client/src/`, `packages/model/src/`
- Risk: Any refactoring or new feature can silently break existing behavior. The `test` script in `apps/api/package.json` exits with an error by design.
- Priority: High — the authorization gap in particular should be covered by integration tests before new routes are added.

---

*Concerns audit: 2026-06-27*
