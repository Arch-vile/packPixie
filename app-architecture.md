# App architecture

## 1. System overview

**Goal:**
Cheap, collaborative hiking trip packing app with per-row concurrency and per-trip customization.

**Stack:**

- **Frontend:** React SPA (or similar) hosted on **S3 + CloudFront**
- **Auth:** **Cognito User Pool** with **Google** as identity provider
- **Backend:**

  - **API Gateway (HTTP API)** →
  - **Single Node.js Lambda** using an internal **router** (e.g. custom router / mini-Express)

- **Database:** **DynamoDB** (on-demand)
- **Sync:** Polling-based `changes?since=...` (WebSockets optional later)

---

## 2. Frontend architecture

**Tech & hosting**

- SPA built with React (or similar).
- Deployed as static assets to **S3**.
- Served via **CloudFront** (global caching, HTTPS, custom domain).

**Responsibilities**

- Handle **Google → Cognito** login flow and store JWT.
- Render **trip list** and **trip pages** (Packing, Distribution, Summary).
- On trip open, call **snapshot API** to get everything needed in one go.
- Keep **normalized client-side state** for:

  - Trip metadata
  - Participants
  - Columns & roles
  - Rows (items)
  - Filters
  - Metrics definitions
  - Distribution assignments

- Apply filters and most table logic **on the client** for snappy UX.
- Perform **optimistic UI updates** for edits; handle conflict responses gracefully.
- Periodically poll for changes (`GET /trips/:tripId/changes?since=...`).

---

## 3. Auth & identity

**Auth stack**

- **Cognito User Pool**
- **Google** as an identity provider (OIDC / SAML integration)

**Flow**

1. User clicks “Sign in with Google”.
2. User authenticates with Google; Cognito issues a **JWT (ID token)**.
3. Frontend stores token and attaches it to all API requests:

   - `Authorization: Bearer <id-token>`

4. **API Gateway** uses Cognito Authorizer to validate the token.
5. The Lambda retrieves `userId` (e.g. `sub`) and email from JWT claims and maps to internal user model.

The backend trusts only the **claims from Cognito**, not anything from the client state.

---

## 4. Backend: single Lambda with internal router

### 4.1 Shape

- **One Lambda function** (Node.js / TypeScript).
- API Gateway is configured with **proxy integration**:

  - All paths `/` → same Lambda.

- Inside the Lambda, you implement a **router**:

  - Reads `event.httpMethod` and `event.path` (and query/body).
  - Dispatches to the correct handler:

    - `GET /trips`
    - `GET /trips/:tripId/snapshot`
    - `PATCH /trips/:tripId/rows/:rowId`, etc.

This same router is exposed as a normal HTTP server in local dev, e.g.:

- `appHandler(event, context)` for Lambda
- `appHandlerFromExpress(req, res)` when running locally

So you keep **one codebase** for both Lambda and local dev.

### 4.2 Responsibilities of the Lambda app

- **Request routing and validation**

  - Path → handler
  - Parse/validate JSON body, query params.

- **AuthZ**

  - Read user identity from JWT claims.
  - Check membership in `TripMembers` before allowing trip-level operations.

- **Business logic**

  - Trip creation & copying.
  - Column management & role assignments.
  - Row CRUD with row-level version checks.
  - Filter & metric definition persistence.
  - Summary metric computation (for now).
  - Distribution suggestion algorithm & persistence.

- **DynamoDB access**

  - Read/write to tables.
  - Use **conditional expressions** for optimistic locking on rows.

- **Change-feed endpoints**

  - `GET /trips/:tripId/changes?since=...` for polling-based sync.

You can internally structure the code as modules/services (TripService, RowService, etc.) even though it’s one Lambda.

---

## 5. Data model in DynamoDB

All data is scoped by `tripId` so that each trip is a natural partition.

### 5.1 `Trips` table

- **PK:** `tripId`
- Attributes:

  - `name`
  - `ownerUserId`
  - `createdAt`
  - `archived` flag, etc.

### 5.2 `TripMembers` table

- **PK:** `tripId`
- **SK:** `userId`
- Attributes:

  - `role` (e.g. OWNER, MEMBER)
  - `displayName`
  - `joinedAt`

Used to:

- List trips for a user (via GSI on `userId` if needed).
- Check if the caller can access a given `tripId`.

### 5.3 `TripColumns` table

- **PK:** `tripId`
- **SK:** `COL#<columnId>`
- Attributes:

  - `columnId`
  - `name`
  - `type` (`text`, `integer`, `boolean`, `participant`, `tag`)
  - `role` (optional role enum: BRINGER, WEIGHT, QUANTITY, SHARED, CONSUMABLE)
  - `tagOptions` (for tag-type columns)
  - `orderIndex`

### 5.4 `TripRows` table (row-level optimistic locking)

- **PK:** `tripId`
- **SK:** `ROW#<rowId>`
- Attributes:

  - `rowId`
  - `itemName`
  - `values` (Map<columnId, value>) – flexible schema per trip.
  - `version` (int) – **for optimistic locking**
  - `updatedAt` (ISO string)
  - `updatedByUserId`
  - Optional denormalized fields for convenient queries:

    - `bringerUserId`
    - `shared` (boolean)
    - `statusTags` etc.

  - Optional `deleted` flag (for soft deletion and change queries).

**Update pattern:**

- Client sends `expectedVersion` with a row update.
- Lambda does:

  - `ConditionExpression: version = :expectedVersion`
  - On success:

    - Update fields, increment `version`, update `updatedAt/updatedByUserId`.

  - On failure:

    - Throw 409 + latest version of the row.

### 5.5 `TripFilters` table

- **PK:** `tripId`
- **SK:** `FILTER#<filterId>`
- Attributes:

  - `filterId`
  - `name`
  - `definition` (JSON representing AND/OR, column conditions)

Filters are loaded as part of the trip snapshot and evaluated client-side initially.

### 5.6 `TripMetrics` table

- **PK:** `tripId`
- **SK:** `METRIC#<metricId>`
- Attributes:

  - `metricId`
  - `name`
  - `groupBy` (array of columnIds)
  - `aggregate` (`sum` / `count`)
  - `targetColumnId` (for sum)
  - `filterDefinition` (optional)

Summary Lambda handler reads rows and metric definitions; applies filter & aggregation logic.

### 5.7 `TripDistributionAssignments` table

- **PK:** `tripId`
- **SK:** `DIST#<rowId>`
- Attributes:

  - `rowId`
  - `carrierUserId` (who carries the shared item)
  - `group` (`CONSUMABLE` / `NON_CONSUMABLE`)
  - Optional snapshot data (weight/quantity at the time of assignment).

---

## 6. Collaboration model: concurrency & sync

### 6.1 Concurrency per row

- **Granularity:** Each row (item) is a concurrency unit.
- **Mechanism:** Optimistic locking via `version` attribute in `TripRows`.
- **Behavior:**

  - Most edits by different users will hit **different rows → no conflict**.
  - Concurrent edit on **same row**:

    - Loser gets 409 + updated row.
    - Client can show a small conflict toast or attempt field-level merge.

### 6.2 Sync between users

**MVP: polling**

- Client holds `lastSyncAt` timestamp (the time of last successful snapshot/changes call).

- Every X seconds (e.g. 3–10s):

  ```text
  GET /trips/:tripId/changes?since=<ISO-timestamp>
  ```

- Lambda handler:

  - Query `TripRows` for rows where `updatedAt > since` (possibly via GSI).
  - Return `rowsUpdated` and `rowIdsDeleted`.
  - Could also include changes to columns/filters/metrics if needed.

Client merges these changes into its in-memory state.

**Future: WebSockets**

- If you need real-time updates later, add:

  - API Gateway WebSocket API.
  - Connections subscribed per `tripId`.
  - On updates, publish messages to those connections.

No need to design that now, but the rest of the architecture doesn’t block it.

---

## 7. API surface (via single Lambda router)

Example endpoints exposed by API Gateway → all routed inside one Lambda:

**Trips & navigation**

- `GET /trips`

  - List trips where user is a member.

- `POST /trips`

  - Create new trip.

- `POST /trips/:tripId/copy`

  - Deep clone trip (columns, rows, filters, metrics, distribution).

**Trip content**

- `GET /trips/:tripId/snapshot`

  - Returns the full data needed to render a trip:

    - trip, participants, columns, rows, filters, metrics, distribution assignments.

- `GET /trips/:tripId/changes?since=...`

  - Returns incremental updates since timestamp.

**Columns**

- `POST /trips/:tripId/columns`
- `PATCH /trips/:tripId/columns/:columnId`
- `DELETE /trips/:tripId/columns/:columnId`

**Rows**

- `POST /trips/:tripId/rows`
- `PATCH /trips/:tripId/rows/:rowId` (with `expectedVersion`)
- `DELETE /trips/:tripId/rows/:rowId`

**Filters & metrics**

- `POST /trips/:tripId/filters`
- `PATCH /trips/:tripId/filters/:filterId`
- `POST /trips/:tripId/metrics`
- `PATCH /trips/:tripId/metrics/:metricId`
- `POST /trips/:tripId/summary/run`

  - Compute metrics for Summary view.

**Distribution**

- `POST /trips/:tripId/distribution/suggest`

  - Run balancing algorithm.

- `POST /trips/:tripId/distribution/save`

  - Persist manual adjustments.

All these are just different branches in the internal router of the single Lambda.

---

## 8. Local development story

Because everything is a single Node process with a router:

- You can expose the same router as:

  - `handler(event, context)` for Lambda.
  - `expressApp` (or Node HTTP server) for local dev.

- For local runs:

  - Run something like `npm run dev` that starts Express on `http://localhost:3000`.
  - Frontend dev server proxies `/api` → `localhost:3000`.

Benefits:

- No need for local Lambda emulators at first.
- Same code paths for routing, validation, business logic, and DynamoDB access.
- When deploying, you just wrap the router into the Lambda handler.
