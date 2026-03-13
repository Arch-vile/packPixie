# App architecture

## 1. System overview

**Goal:**
Cheap, collaborative hiking trip packing app with **fixed, purpose-built data model** (no per-trip customization) and **per-row concurrency**.

**Stack:**

- **Frontend:** React SPA hosted on **S3 + CloudFront**
- **Auth:** **Cognito User Pool** with **Google** IdP
- **Backend:** **API Gateway (HTTP API)** → **single Node.js/TS Lambda** with internal router
- **Database:** **DynamoDB** (on-demand)
- **Sync:** Polling-based `changes?since=...` (WebSockets optional later)

## 2. Frontend architecture

**Tech & hosting**

- React SPA (or similar), static build to **S3**, served via **CloudFront**.

**Responsibilities**

- Google → Cognito login, store JWT.
- Render:

  - Trip list
  - Trip tabs: **Packing / Distribution / Summary**

- On trip open, call **snapshot API** for everything needed.
- Keep normalized client state for:

  - Trip metadata
  - Participants
  - **Rows (items)** with fixed fields
  - Distribution assignments

- Provide **built-in views** (no filter builder):

  - All items, My items, Shared gear, To buy, Packed (+ optional search)

- Optimistic UI edits with conflict handling (row-level versioning).
- Poll for changes: `GET /trips/:tripId/changes?since=...`

**What’s removed vs before**

- No client state for **columns/roles**, **custom filters**, **custom metrics definitions**.

---

## 3. Auth & identity

- **Cognito User Pool** with **Google** as IdP
- Frontend uses `fetchAuthSession()` from `aws-amplify/auth` to get the current Cognito ID token
- Frontend sends `Authorization: Bearer <id-token>` on all authenticated API calls
- JWT verification happens in **Fastify middleware** (`apps/api/src/plugins/auth.ts`), not at the API Gateway layer
  - Uses `aws-jwt-verify` (Amazon's official library) to validate Cognito ID tokens
  - JWKS keys are fetched once from Cognito's public endpoint and cached in memory (persists across warm Lambda invocations)
  - Sets `request.user` with `sub` and `email` from verified JWT claims
  - Returns 401 for missing/invalid/expired tokens
- Backend trusts **claims**, not client-provided identity fields
- Routes are split into **public** (`/api/hello`, `/api/status`) and **protected** (everything else) scopes

---

## 4. Backend: single Lambda with internal router

### 4.1 Shape

- One Node.js/TypeScript Lambda behind API Gateway proxy integration.
- Internal router dispatches to handlers, e.g.:

  - `GET /trips`
  - `GET /trips/:tripId/snapshot`
  - `PATCH /trips/:tripId/rows/:rowId`

Local dev can run the same router as an HTTP server.

### 4.2 Responsibilities (updated)

- Request routing + validation
- AuthZ:

  - Verify caller is a `TripMember` for the trip

- Business logic:

  - Trip create/copy
  - Participant join via invite link (if you have invites)
  - Row CRUD with optimistic locking
  - Built-in summary computation
  - Distribution suggestion algorithm + persistence

- DynamoDB access with conditional expressions
- Change-feed endpoints for polling sync

**What’s removed vs before**

- No column management, no role assignment, no persistence for custom filters/metrics.

---

## 5. Data model in DynamoDB (fixed schema)

All data is scoped by `tripId` as partition key.

### 5.1 `Trips` table

- **PK:** `tripId`
- Attributes:

  - `name`
  - `ownerUserId`
  - `createdAt`
  - Optional: `archived`

### 5.2 `TripMembers` table

- **PK:** `tripId`
- **SK:** `userId`
- Attributes:

  - `role` (OWNER, MEMBER)
  - `displayName`
  - `joinedAt`

For listing trips by user, add **GSI**:

- **GSI1PK:** `userId`
- **GSI1SK:** `joinedAt` (or `tripId`)

### 5.3 `TripRows` table (row-level optimistic locking)

- **PK:** `tripId`
- **SK:** `ROW#<rowId>`
- Attributes (fixed fields):

  - `rowId`
  - `itemName` (string)
  - `bringerUserId` (string)
  - `shared` (boolean)
  - `consumable` (boolean)
  - `quantity` (number/int)
  - `weightGrams` (number/int) _(per unit)_
  - `status` (enum string, e.g. `to-buy|found|packed`)
  - `category` (enum string)
  - `version` (int) — optimistic locking
  - `updatedAt` (ISO string)
  - `updatedByUserId`
  - Optional: `deleted` (soft delete)

**Update pattern**

- Client sends `expectedVersion`
- Lambda writes with:

  - `ConditionExpression: version = :expectedVersion`

- On conflict: return **409** + latest row.

### 5.4 `TripDistributionAssignments` table

- **PK:** `tripId`
- **SK:** `DIST#<rowId>`
- Attributes:

  - `rowId`
  - `carrierUserId`
  - `group` (`CONSUMABLE` / `NON_CONSUMABLE`)
  - Optional: `assignedAt`, `assignedByUserId`

> Distribution assignments remain separate from bringer on purpose.

---

## 6. Collaboration model: concurrency & sync

### 6.1 Concurrency per row

- Optimistic locking on `TripRows.version`
- Most edits won’t conflict because they’re typically on different rows
- Conflict handling:

  - 409 response includes latest row
  - Client shows a conflict message and refreshes/merges

### 6.2 Sync between users (polling MVP)

- Client stores `lastSyncAt`
- Poll:

  - `GET /trips/:tripId/changes?since=<ISO>`

- Lambda returns:

  - `rowsUpdated` (full row objects)
  - `rowIdsDeleted`
  - `distributionUpdated` (changed assignments) and/or `distRowIdsDeleted`

**Implementation note**

- To query “updated since”, add GSIs or use a dedicated change log (see below).

---

## 7. Change tracking options (pick one)

### Option A: GSI on updatedAt (simple, OK for small scale)

Add GSI to `TripRows`:

- **GSI1PK:** `tripId`
- **GSI1SK:** `updatedAt`

Then query `updatedAt > since`.
Do the same for distribution assignments (another GSI) or store their `updatedAt`.

### Option B: Change log table (cleaner long-term)

`TripChanges` table:

- **PK:** `tripId`
- **SK:** `TS#<iso>#<entity>#<id>`
- Attributes: `entityType` (ROW/DIST), `entityId`, `op` (UPSERT/DELETE)

This makes `changes?since` fast and consistent without extra GSIs.

---

## 8. API surface (updated)

**Trips**

- `GET /trips` — list trips for user
- `POST /trips` — create trip
- `POST /trips/:tripId/copy` — clone trip (rows + distribution + members optional)

**Trip snapshot & sync**

- `GET /trips/:tripId/snapshot`

  - trip + participants + rows + distribution assignments

- `GET /trips/:tripId/changes?since=...`

  - incremental row + distribution changes

**Rows**

- `POST /trips/:tripId/rows`
- `PATCH /trips/:tripId/rows/:rowId` (includes `expectedVersion`)
- `DELETE /trips/:tripId/rows/:rowId`

**Distribution**

- `POST /trips/:tripId/distribution/suggest`
- `POST /trips/:tripId/distribution/save` (manual adjustments batch)

**Summary**

- `GET /trips/:tripId/summary`

  - returns the built-in computed summaries (no custom metric definitions)

**Removed endpoints**

- All `/columns`, `/filters`, `/metrics`, `/summary/run` (custom metric runner) endpoints.

---

## 9. Local development story

Still the same:

- One router usable as:

  - Lambda handler in prod
  - Node/Express server locally

- Frontend dev server proxies `/api` to local backend.
