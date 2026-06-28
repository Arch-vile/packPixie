<!-- refreshed: 2026-06-27 -->
# Architecture

**Analysis Date:** 2026-06-27

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                     Client (React SPA)                           │
│           `apps/client/src/`  — S3 + CloudFront                  │
├──────────────────────────────────────────────────────────────────┤
│   Auth: Amplify + Cognito                                        │
│   `apps/client/src/aws-config.ts`                                │
│   Authorization: Bearer <id-token> on every protected request    │
└────────────────────┬─────────────────────────────────────────────┘
                     │  HTTPS  (REST/JSON)
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│              API Gateway (HTTP API proxy)                         │
└────────────────────┬─────────────────────────────────────────────┘
                     │  Lambda proxy integration
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│          Single Lambda — Fastify internal router                  │
│          `apps/api/src/index.ts`                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Plugins: helmet, cors, sensible                          │   │
│  │  Auth hook (onRequest): `apps/api/src/plugins/auth.ts`   │   │
│  │  Routes: `apps/api/src/routes/api.ts`                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────┬─────────────────────────────────────────────┘
                     │  AWS SDK v3
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DynamoDB (on-demand)                           │
│              single table — `apps/api/src/lib/dynamodb.ts`       │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `main.tsx` | App bootstrap, Amplify import, React root mount | `apps/client/src/main.tsx` |
| `aws-config.ts` | Configure Amplify with Cognito pool/client IDs | `apps/client/src/aws-config.ts` |
| `App.tsx` | Authenticator wrapper; splits authenticated shell from sign-in | `apps/client/src/App.tsx` |
| `api/api.ts` | All HTTP calls to the backend; injects auth token via `fetchAuthSession()` | `apps/client/src/api/api.ts` |
| `TripList.tsx` | Trip CRUD UI and form state | `apps/client/src/TripList.tsx` |
| `config.ts` (client) | Read Vite env vars; crash-fast if any are missing | `apps/client/src/config.ts` |
| `index.ts` (api) | Build Fastify instance, register plugins, export Lambda handler | `apps/api/src/index.ts` |
| `config.ts` (api) | Builder-pattern config object from env vars | `apps/api/src/config.ts` |
| `auth.ts` | `fastify-plugin` hook: verify Cognito ID token, set `request.user` | `apps/api/src/plugins/auth.ts` |
| `api.ts` (routes) | All API route handlers in one file (public + protected scopes) | `apps/api/src/routes/api.ts` |
| `dynamodb.ts` | Create `DynamoDBDocumentClient` singleton | `apps/api/src/lib/dynamodb.ts` |
| `packages/model` | Shared TypeScript interfaces consumed by both apps | `packages/model/src/` |

## Pattern Overview

**Overall:** Serverless monolith — a single Node.js Lambda with an internal Fastify router handles all API traffic. The frontend is a React SPA with Amplify-managed auth. Shared types flow through a workspace package.

**Key Characteristics:**
- One Lambda function behind API Gateway; no microservices split
- Fastify plugin scoping used for auth boundary (public vs. protected sub-routers)
- All business logic and DynamoDB access lives inline in route handlers (no service layer)
- Shared contract (`@packpixie/model`) prevents type drift between client and server
- Polling-based sync (`changes?since=...` planned); no WebSocket or real-time layer yet

## Layers

**Client Presentation Layer:**
- Purpose: Render UI, manage local React state, drive user interactions
- Location: `apps/client/src/`
- Contains: React components, hooks, CSS
- Depends on: `apps/client/src/api/api.ts`, `@packpixie/model`
- Used by: End users via CloudFront

**Client API Layer:**
- Purpose: All backend communication; token acquisition and injection
- Location: `apps/client/src/api/api.ts`
- Contains: `fetch` wrappers, auth header helper
- Depends on: `aws-amplify/auth` (token), `config.ts` (API URL)
- Used by: React components

**API Entry / Infrastructure Layer:**
- Purpose: Bootstrap Fastify, register global plugins, export Lambda handler
- Location: `apps/api/src/index.ts`
- Contains: Plugin registration (helmet, CORS, sensible), Lambda adapter, local HTTP server start
- Depends on: `config.ts`, `lib/dynamodb.ts`, `routes/api.ts`
- Used by: AWS Lambda runtime

**Auth Middleware Layer:**
- Purpose: Verify Cognito ID tokens and populate `request.user`
- Location: `apps/api/src/plugins/auth.ts`
- Contains: `CognitoJwtVerifier`, `onRequest` hook, `fastify-plugin` wrapper
- Depends on: `aws-jwt-verify`, `Config`
- Used by: Protected route scope in `routes/api.ts`

**Route / Business Logic Layer:**
- Purpose: Request routing, input validation, business logic, DynamoDB access
- Location: `apps/api/src/routes/api.ts`
- Contains: All route handlers, DynamoDB queries, trip and comment logic
- Depends on: `DynamoDBDocumentClient`, `Config`, `@packpixie/model`, `plugins/auth.ts`
- Used by: `index.ts` via `fastify.register(apiRoutes(...))`

**Shared Model Layer:**
- Purpose: Single source of truth for request/response types shared by client and server
- Location: `packages/model/src/`
- Contains: TypeScript interfaces (`Trip`, `TripComment`, `StatusResponse`, etc.)
- Depends on: Nothing
- Used by: `apps/api`, `apps/client`

## Data Flow

### Authenticated API Request

1. User action in component (e.g. `TripList.tsx` calls `createTrip()`)
2. `getAuthHeaders()` in `apps/client/src/api/api.ts` calls `fetchAuthSession()` → extracts `idToken`
3. `fetch` to `${config.apiUrl}/api/...` with `Authorization: Bearer <token>`
4. API Gateway forwards request to Lambda
5. Fastify `onRequest` hook in `apps/api/src/plugins/auth.ts` verifies token via `CognitoJwtVerifier`, sets `request.user`
6. Route handler in `apps/api/src/routes/api.ts` reads `request.user.email` for identity — never from request body
7. Handler sends DynamoDB command via `DynamoDBDocumentClient` (`apps/api/src/lib/dynamodb.ts`)
8. Response JSON returned → Fastify serializes → Lambda proxy → client

### Public API Request

1. Component calls `fetch` directly (no auth header) — e.g. `StatusChecker.tsx`
2. Request reaches the public Fastify scope (no `authPlugin` registered)
3. Handler runs, returns response — e.g. `GET /api/status` checks DynamoDB connectivity

### Trip Creation Flow

1. `TripList.tsx` submits form → `createTrip(name, emails)` in `api/api.ts`
2. `POST /api/trips` with `{ tripName, participantEmails }`
3. Handler validates, generates `tripId` (UUID), builds DynamoDB `TransactWriteCommand` for atomic TRIP#META + creator USER# item
4. Additional participant items written in BatchWrite chunks of 25
5. `201` response with `{ tripId, tripName, createdAt }`
6. Client calls `getTrips()` to refresh list

## Key Abstractions

**`Config` (builder pattern):**
- Purpose: Type-safe config object built from env vars at startup; fails fast if any required var is absent
- Examples: `apps/api/src/config.ts`
- Pattern: Builder with method chaining → `.build()` returns frozen `Config` object

**`authPlugin` (fastify-plugin):**
- Purpose: Reusable Fastify hook that adds JWT auth to any scope; uses `fastify-plugin` so the `request.user` decorator is visible to sibling scopes
- Examples: `apps/api/src/plugins/auth.ts`
- Pattern: Factory function accepting `Config` → returns `fp()`-wrapped async plugin

**`@packpixie/model` (workspace package):**
- Purpose: Shared TypeScript interfaces eliminate type duplication between client and server
- Examples: `packages/model/src/trip.ts`, `packages/model/src/comment.ts`, `packages/model/src/status.ts`
- Pattern: Plain interface exports, barrel via `packages/model/src/index.ts`

**`apiRoutes` (route factory):**
- Purpose: Returns a Fastify plugin function that registers all `/api` routes; accepts `conf` and `dynamoDBClient` as closure dependencies (no global state)
- Examples: `apps/api/src/routes/api.ts`
- Pattern: Factory closure — avoids module-level singletons in route files

## Entry Points

**Lambda Handler:**
- Location: `apps/api/src/index.ts` — `export const handler = awsLambdaFastify(fastify)`
- Triggers: API Gateway HTTP API proxy integration (production)
- Responsibilities: Initialize Fastify, plugins, routes; export handler for Lambda runtime

**Local HTTP Server:**
- Location: `apps/api/src/index.ts` — `start()` function guarded by `!process.env.AWS_LAMBDA_FUNCTION_NAME`
- Triggers: `pnpm dev` via `tsx watch src/index.ts`
- Responsibilities: Listen on `PORT` (default 3001) for local development

**React SPA:**
- Location: `apps/client/src/main.tsx`
- Triggers: Browser load from CloudFront (prod) or Vite dev server
- Responsibilities: Import `aws-config.ts` (side-effect Amplify init), mount `<App />` in `StrictMode`

## Architectural Constraints

- **Identity source:** User identity always comes from `request.user` (set by verified JWT claims). Never read from request params or body.
- **Plugin decoration visibility:** Fastify plugins that need to share hooks/decorators with sibling routes must be wrapped with `fastify-plugin` (see `auth.ts`). Without `fp()`, decorators are scoped to the child instance only.
- **ESM imports:** All relative imports in `apps/api` must use `.js` extensions (e.g. `from '../config.js'`). Required for ESM resolution at runtime even though source is TypeScript.
- **Lambda cold start:** JWKS keys from Cognito are fetched and cached in memory by `aws-jwt-verify` on first request; they persist across warm invocations.
- **Global state:** `DynamoDBDocumentClient` and `CognitoJwtVerifier` are module-level singletons created at Lambda init time. Thread safety is not a concern (single-threaded Node.js event loop).
- **No service layer:** All business logic is inline in route handlers in `apps/api/src/routes/api.ts`. There is no repository, service, or use-case abstraction layer.

## Anti-Patterns

### Putting user identity in request body/params

**What happens:** A handler reads `request.body.userId` or `request.params.userId` to determine who is making the request.
**Why it's wrong:** Clients can send any value; this bypasses the JWT-verified identity.
**Do this instead:** Always read `request.user.email` or `request.user.sub` (set by `auth.ts` hook) for the caller's identity.

### Registering auth-sensitive plugins without `fastify-plugin`

**What happens:** `authPlugin` is registered without `fp()` wrapping; `request.user` decorator is not visible to sibling or parent scopes.
**Why it's wrong:** Route handlers outside the child scope throw "user is not a property of request".
**Do this instead:** Always wrap Fastify plugins that set shared decorators/hooks with `fastify-plugin` as done in `apps/api/src/plugins/auth.ts`.

### Using bare relative imports without `.js` extension in `apps/api`

**What happens:** `import { foo } from './bar'` (no extension).
**Why it's wrong:** Node ESM resolution requires explicit extensions; the build succeeds but runtime fails.
**Do this instead:** `import { foo } from './bar.js'` — keep `.js` extension on all relative imports in `apps/api`.

## Error Handling

**Strategy:** Fail-fast for configuration errors (throw at startup); return structured HTTP errors for request-level failures.

**Patterns:**
- `config.ts` throws synchronously if any required env var is absent — surfaces misconfiguration before the first request
- Auth hook returns `reply.unauthorized()` (via `@fastify/sensible`) for missing/invalid/expired tokens
- Route handlers use `reply.status(4xx).send({ error: '...' })` for validation failures
- DynamoDB errors propagate to Fastify's default error handler (500 + logged)

## Cross-Cutting Concerns

**Logging:** Fastify built-in logger (pino). Level is `debug` in development, `info` in production (controlled by `NODE_ENV`).
**Validation:** Manual guard checks in route handlers (e.g. `if (!tripName?.trim())`). No schema-based validation layer (Fastify JSON Schema not used yet).
**Authentication:** Cognito ID token verified by `aws-jwt-verify` in `apps/api/src/plugins/auth.ts`; Amplify UI handles login flow on the client in `apps/client/src/App.tsx`.

---

*Architecture analysis: 2026-06-27*
