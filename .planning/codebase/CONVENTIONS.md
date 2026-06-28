# Coding Conventions

**Analysis Date:** 2026-06-27

## Naming Patterns

**Files:**
- React components: PascalCase (`TripList.tsx`, `StatusChecker.tsx`, `ApiConnectionStatus.tsx`, `Comments.tsx`)
- Non-component TypeScript modules: camelCase (`config.ts`, `auth.ts`, `dynamodb.ts`, `api.ts`)
- Route modules: camelCase (`api.ts` under `routes/`)

**Functions:**
- camelCase for all functions: `apiRoutes`, `checkDynamoDB`, `createDynamoDBClient`, `getTrips`, `postComment`, `fetchComments`, `addEmail`
- React event handlers: `handle` prefix (`handleCreate`, `handleCancel`, `handleEmailKeyDown`)
- API client functions: verb prefix matching HTTP semantics (`getTrips`, `postComment`, `createTrip`)

**Variables:**
- camelCase throughout: `dynamoDBClient`, `appVersion`, `tripName`, `creatorEmail`
- Intentionally unused variables/parameters prefixed with `_`: `_request`, `_reply`, `_error`

**Types and Interfaces:**
- PascalCase for all: `Config`, `AuthUser`, `Trip`, `TripComment`, `StatusResponse`, `DBStatus`
- Interfaces preferred for object shapes: `interface Trip`, `interface TripComment`, `interface CreateTripRequest`
- `type` used for union or discriminated types: `type DBStatus = { status: 'connected' | 'disconnected' | 'error'; ... }`
- Props interfaces defined immediately above the component that consumes them:
  ```typescript
  interface TripListProps {
    userEmail: string;
    trips: Trip[];
    onTripsChange: (trips: Trip[]) => void;
  }
  export function TripList({ userEmail, trips, onTripsChange }: TripListProps) { ... }
  ```

**DynamoDB Keys:**
- SCREAMING_SNAKE_CASE with `#` separator: `PK: 'TRIP#${tripId}'`, `SK: 'META#${tripId}'`, `SK: 'USER#${email}'`
- GSI keys follow same pattern: `GSI1PK: 'USER#${email}'`, `GSI1SK: 'TRIP#${tripId}'`

**React Components:**
- Named exports for reusable/shared components: `export function TripList`, `export function Header`
- Default exports for top-level or page-level components: `export default function Comments`, `export default function StatusChecker`, `export default App`

## Code Style

**TypeScript:**
- `strict: true` enabled in all packages (`apps/api/tsconfig.json`, `apps/client/tsconfig.app.json`, `packages/model/tsconfig.json`)
- Client additionally enforces `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- ES2022 target for API and client; ES2020 for `packages/model`
- ESM modules (`"type": "module"`) in `apps/api` and `apps/client`

**Formatting:**
- No Prettier configuration detected — no `.prettierrc*` files present
- Formatting is not enforced by tooling; relies on developer consistency and TypeScript compiler strictness

**Linting:**
- ESLint with `typescript-eslint` in both `apps/api` and `apps/client` (`apps/api/eslint.config.js`, `apps/client/eslint.config.js`)
- API-specific rule: `.js` extensions **required** on relative imports, `.ts` extensions forbidden:
  ```javascript
  'import/extensions': ['error', 'ignorePackages', { ts: 'never', js: 'always' }]
  ```
  This means all relative imports in `apps/api` must use `.js` suffix: `from '../config.js'`, `from '../plugins/auth.js'`
- Unused vars pattern: `argsIgnorePattern: '^_'` and `caughtErrorsIgnorePattern: '^_'`
- Client uses `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`

## Import Organization

**Observed order (not enforced by sort-imports):**

1. Third-party/external packages (e.g., AWS SDK, Fastify, React)
2. Internal workspace packages (`@packpixie/model`)
3. Relative imports (local modules, config, plugins)

**Example from `apps/api/src/routes/api.ts`:**
```typescript
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DBStatus, StatusResponse } from '@packpixie/model';
import { FastifyInstance } from 'fastify';
import { Config } from '../config.js';
import { authPlugin } from '../plugins/auth.js';
```

**Path Aliases:**
- None configured. All imports use relative paths or workspace package names.
- No `@/` or `~/` aliases in any tsconfig.

**Module Exports (`packages/model`):**
- Barrel file at `packages/model/src/index.ts` re-exports everything with `.js` extensions:
  ```typescript
  export * from './status.js';
  export * from './trip.js';
  export * from './comment.js';
  ```

## Error Handling

**API (Fastify):**
- Validation errors: return early with `reply.status(400).send({ error: 'message' })`
- Auth errors: `reply.unauthorized('message')` from `@fastify/sensible`
- Infrastructure errors: `try/catch` blocks, error message extracted via `instanceof Error` guard:
  ```typescript
  } catch (error) {
    return {
      status: 'error' as const,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
  ```
- JWT failures logged with structured context before responding: `request.log.warn({ err }, 'JWT verification failed')`
- Caught errors that are intentionally ignored use `_error` naming: `} catch (_error) {`

**Client (React):**
- Error state stored as `useState<string | null>(null)`, reset at start of each async operation
- Standard pattern across all async components:
  ```typescript
  const [error, setError] = useState<string | null>(null);
  try {
    setError(null);
    await someApiCall();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Fallback message');
  } finally {
    setLoading(false);
  }
  ```
- Failed fetches checked with `if (!response.ok) { throw new Error('...') }`
- Errors rendered inline in component JSX (not via toast/notification system)

## Logging

**API:**
- Uses Fastify's built-in structured logger throughout
- Log level determined at startup: `level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'`
- Route-level logging: `request.log.warn({ err }, 'JWT verification failed')`
- Server-level logging: `fastify.log.info(...)`, `fastify.log.error(...)`
- **Known issue:** A leftover debug `console.log` exists in `apps/api/src/index.ts` lines 11–14 (a string of `X` characters followed by `process.env.NODE_ENV`)

**Client:**
- No structured logging library — errors surfaced via component state only
- No `console.log` calls in production client code

## TypeScript-Specific Patterns

**Module Augmentation:**
- Used to extend Fastify's `FastifyRequest` with `user` property in `apps/api/src/plugins/auth.ts`:
  ```typescript
  declare module 'fastify' {
    interface FastifyRequest {
      user: AuthUser;
    }
  }
  ```

**Builder/Fluent Pattern (Config):**
- Config construction in `apps/api/src/config.ts` uses a builder with method chaining:
  ```typescript
  config().dynamoDBTable(process.env.DYNAMODB_TABLE).cognitoUserPoolId(...).build()
  ```

**Fastify Plugin Wrapping:**
- Plugins that must share decorators/hooks across sibling scopes use `fastify-plugin` (`fp`):
  ```typescript
  return fp(async function (fastify: FastifyInstance) { ... });
  ```

**React State Patterns:**
- `useCallback` used to stabilize async fetch functions used as `useEffect` dependencies (`Comments.tsx`)
- `useEffect` cleanup not implemented (no AbortController or cleanup returns)

**Generic Route Types:**
- Fastify routes with typed bodies use generic syntax:
  ```typescript
  protected_.post<{ Body: CreateTripRequest }>('/trips', async (request, reply) => { ... })
  ```

## Module Design

**`packages/model`:** Pure type definitions only — interfaces and types, no runtime logic. Consumed by both `apps/api` and `apps/client` via workspace dependency `@packpixie/model`.

**`apps/api`:** Route logic is co-located in a single file (`src/routes/api.ts`). No service layer or repository pattern — DynamoDB client is passed directly into route handlers.

**`apps/client`:** API calls centralized in `src/api/api.ts`. Components import directly from this module rather than calling `fetch` themselves.

**`as const`:** Used for immutable config objects in the client:
```typescript
const config = { version: ..., apiUrl: ..., cognito: { ... } } as const;
```

---

*Convention analysis: 2026-06-27*
