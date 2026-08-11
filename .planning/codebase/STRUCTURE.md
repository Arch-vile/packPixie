# Codebase Structure

**Analysis Date:** 2026-06-27

## Directory Layout

```
packPixie/                        # Monorepo root (pnpm + Turbo)
├── apps/
│   ├── api/                      # Fastify backend (Lambda in prod, HTTP server locally)
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point — Fastify bootstrap, Lambda handler export
│   │   │   ├── config.ts         # Builder-pattern config from env vars
│   │   │   ├── version.json      # Embedded version string read at startup
│   │   │   ├── lib/
│   │   │   │   └── dynamodb.ts   # DynamoDBDocumentClient factory
│   │   │   ├── plugins/
│   │   │   │   └── auth.ts       # Cognito JWT auth hook (fastify-plugin)
│   │   │   └── routes/
│   │   │       └── api.ts        # All route handlers (public + protected scopes)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── eslint.config.js
│   └── client/                   # React 19 SPA (Vite, S3 + CloudFront)
│       ├── src/
│       │   ├── main.tsx          # React root mount; side-effect Amplify init import
│       │   ├── aws-config.ts     # Amplify.configure() with Cognito pool/client IDs
│       │   ├── config.ts         # Read VITE_ env vars; crash-fast on missing
│       │   ├── App.tsx           # Authenticator wrapper; AppContent shell
│       │   ├── Header.tsx        # Top nav bar with version and status
│       │   ├── TripList.tsx      # Trip list and create-trip form
│       │   ├── Comments.tsx      # Comment list and post form
│       │   ├── StatusChecker.tsx # Manual API status check UI
│       │   ├── ApiConnectionStatus.tsx  # Inline API connection badge
│       │   ├── api/
│       │   │   └── api.ts        # All backend fetch calls; auth token injection
│       │   └── assets/           # Static assets (images, etc.)
│       ├── public/               # Vite public dir (served as-is)
│       ├── index.html            # Vite HTML entry
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig*.json
├── packages/
│   └── model/                    # Shared TypeScript types (@packpixie/model)
│       ├── src/
│       │   ├── index.ts          # Barrel export
│       │   ├── trip.ts           # Trip, CreateTripRequest/Response, GetTripsResponse
│       │   ├── comment.ts        # TripComment, GetCommentsResponse
│       │   └── status.ts         # StatusResponse, DBStatus
│       ├── package.json
│       └── tsconfig.json
├── infra/                        # Terraform — AWS infrastructure
│   ├── main.tf                   # Provider, backend config
│   ├── cognito.tf                # Cognito User Pool + Google IdP
│   ├── dynamodb.tf               # DynamoDB single-table + GSI
│   ├── lambda.tf                 # Lambda function + API Gateway
│   ├── client-s3.tf              # S3 bucket + CloudFront distribution
│   ├── variables.tf
│   ├── outputs.tf
│   └── readme.md
├── api-deploy/                   # Lambda deployment artifacts (generated)
│   └── routes/
├── scripts/
│   ├── deploy-lambda.sh          # Build + zip + deploy Lambda
│   └── lambda-logs.sh            # Tail Lambda CloudWatch logs
├── package.json                  # Root — Turbo scripts, husky
├── pnpm-workspace.yaml           # Workspace package globs
├── turbo.json                    # Turbo task graph
├── app-architecture.md           # System design documentation
├── app-description.md            # Product specification
├── dynamoDB-architecture.md      # DynamoDB single-table design
├── CLAUDE.md                     # Agent instructions
└── README.md                     # Local dev setup
```

## Directory Purposes

**`apps/api/src/`:**
- Purpose: Fastify-based API server compiled to ESM; runs as Lambda in production, plain HTTP server locally
- Contains: Entry point, config, plugins, route handlers, DynamoDB client factory
- Key files: `index.ts` (bootstrap), `routes/api.ts` (all handlers), `plugins/auth.ts` (JWT auth)

**`apps/api/src/plugins/`:**
- Purpose: Fastify plugins that extend the request/reply lifecycle
- Contains: `auth.ts` — the only plugin; wraps Cognito JWT verification as a Fastify `onRequest` hook
- Key files: `auth.ts`

**`apps/api/src/routes/`:**
- Purpose: Route registration; all business logic lives here (no separate service layer)
- Contains: `api.ts` — single file defining all `/api/*` routes (public + protected)
- Key files: `api.ts`

**`apps/api/src/lib/`:**
- Purpose: Infrastructure wrappers / thin clients
- Contains: `dynamodb.ts` — `DynamoDBDocumentClient` factory with marshalling options
- Key files: `dynamodb.ts`

**`apps/client/src/`:**
- Purpose: React 19 SPA source; compiled to static bundle deployed to S3
- Contains: React components, API client, config, Amplify setup
- Key files: `main.tsx` (entry), `App.tsx` (auth shell), `api/api.ts` (API layer)

**`apps/client/src/api/`:**
- Purpose: Isolate all backend HTTP calls; injects auth token via Amplify
- Contains: `api.ts` — exports typed async functions (`getTrips`, `createTrip`, `getComments`, `postComment`, `getApiStatus`)
- Key files: `api.ts`

**`packages/model/src/`:**
- Purpose: Single source of truth for types shared between `apps/api` and `apps/client`
- Contains: Interfaces for trips, comments, and API status
- Key files: `index.ts` (barrel), `trip.ts`, `comment.ts`, `status.ts`

**`infra/`:**
- Purpose: Terraform modules for all AWS resources; not part of the Node build
- Contains: Cognito, DynamoDB, Lambda, API Gateway, S3, CloudFront configs

**`scripts/`:**
- Purpose: Deployment shell scripts for the API Lambda
- Contains: `deploy-lambda.sh`, `lambda-logs.sh`

**`api-deploy/`:**
- Purpose: Staging area for Lambda deployment zip artifacts
- Generated: Yes (by `deploy-lambda.sh`)
- Committed: No (should be in `.gitignore`)

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts`: Lambda handler export and local HTTP server start
- `apps/client/src/main.tsx`: React root mount and Amplify side-effect import

**Configuration:**
- `apps/api/src/config.ts`: API config builder (reads `process.env.*`)
- `apps/client/src/config.ts`: Client config (reads `import.meta.env.VITE_*`)
- `apps/client/src/aws-config.ts`: Amplify one-time configuration (side-effect module)
- `turbo.json`: Turbo task dependency graph
- `pnpm-workspace.yaml`: Workspace package declarations

**Core Logic:**
- `apps/api/src/routes/api.ts`: All route handlers, trip/comment business logic, DynamoDB access patterns
- `apps/api/src/plugins/auth.ts`: JWT verification and `request.user` population
- `apps/api/src/lib/dynamodb.ts`: DynamoDB client factory
- `apps/client/src/api/api.ts`: All client-side API calls

**Shared Types:**
- `packages/model/src/trip.ts`: Trip-related interfaces
- `packages/model/src/comment.ts`: Comment interfaces
- `packages/model/src/status.ts`: API status interfaces

**Documentation:**
- `app-architecture.md`: System design and auth flow
- `dynamoDB-architecture.md`: DynamoDB single-table schema and access patterns
- `app-description.md`: Product specification

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g. `TripList.tsx`, `Header.tsx`)
- Non-component TypeScript: `camelCase.ts` (e.g. `config.ts`, `aws-config.ts`, `dynamodb.ts`)
- Utility/config: `kebab-case.ts` for hyphenated names (e.g. `aws-config.ts`)

**Directories:**
- Lowercase, single-word (e.g. `plugins/`, `routes/`, `lib/`, `api/`)
- Workspace apps: lowercase (e.g. `api/`, `client/`)
- Workspace packages: lowercase (e.g. `model/`)

**Exported symbols:**
- Interfaces: `PascalCase` (e.g. `Trip`, `CreateTripRequest`, `AuthUser`)
- Functions: `camelCase` (e.g. `apiRoutes`, `authPlugin`, `createDynamoDBClient`)
- Constants/config objects: `camelCase` (e.g. `config`, `conf`)

## Where to Add New Code

**New API route:**
- Add handler inside `apps/api/src/routes/api.ts` in the appropriate scope (public or protected)
- Add shared request/response types to `packages/model/src/` and re-export from `packages/model/src/index.ts`
- Add client-side API function to `apps/client/src/api/api.ts`

**New Fastify plugin:**
- Create `apps/api/src/plugins/<name>.ts`
- Wrap with `fastify-plugin` (`fp()`) if the plugin sets decorators or hooks that sibling scopes need
- Register in `apps/api/src/index.ts`

**New React component:**
- Create `apps/client/src/<ComponentName>.tsx`
- Import in the appropriate parent component

**New shared type:**
- Add interface to the appropriate file in `packages/model/src/` (`trip.ts`, `comment.ts`, or `status.ts`)
- Export from `packages/model/src/index.ts`
- Run `pnpm build` in `packages/model` (or `pnpm build` from root) before consuming in other packages

**New infrastructure resource:**
- Add a `.tf` file (or extend an existing one) under `infra/`

**New utility / lib:**
- API-side: `apps/api/src/lib/<name>.ts`
- Client-side: `apps/client/src/<name>.ts` (or a new subdirectory if multiple files)

## Special Directories

**`.planning/`:**
- Purpose: GSD workflow artifacts (roadmap, phase plans, codebase maps)
- Generated: By GSD skills
- Committed: Yes (planning artifacts are version-controlled)

**`api-deploy/`:**
- Purpose: Lambda build output staging for deployment
- Generated: Yes (by `scripts/deploy-lambda.sh`)
- Committed: No

**`apps/api/dist/`:**
- Purpose: TypeScript compiled output for the API
- Generated: Yes (by `tsc`)
- Committed: No

**`apps/client/dist/`:**
- Purpose: Vite production bundle for the SPA
- Generated: Yes (by `vite build`)
- Committed: No

---

*Structure analysis: 2026-06-27*
