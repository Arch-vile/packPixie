# Technology Stack

**Analysis Date:** 2026-06-27

## Languages

**Primary:**
- TypeScript 5.9.x - All application code (API, client, shared model)

**Secondary:**
- HCL (Terraform) - Infrastructure provisioning (`infra/`)
- Bash - Deployment scripts (`scripts/`)

## Runtime

**Environment:**
- Node.js (ESM) — `"type": "module"` in all app `package.json` files
- Target: ES2022 (`tsconfig.json` `target`)
- Lambda runtime: Node.js (latest, managed by AWS)

**Package Manager:**
- pnpm 10.12.1
- Lockfile: `pnpm-lock.yaml` (present)
- Workspace config: `pnpm-workspace.yaml` — packages at `apps/*` and `packages/*`
- Supply chain protection: `minimumReleaseAge: 20160` (14-day minimum, strict mode)

## Frameworks

**Backend (API):**
- Fastify 5.5.0 — HTTP framework (`apps/api/src/index.ts`)
  - `@fastify/cors` ^11.1.0 — CORS handling
  - `@fastify/helmet` ^13.0.1 — Security headers
  - `@fastify/sensible` ^6.0.3 — HTTP error helpers
  - `@fastify/aws-lambda` ^6.1.1 — Lambda adapter
  - `fastify-plugin` ^5.1.0 — Plugin scoping

**Frontend (Client):**
- React 19.1.1 — UI framework (`apps/client/src/`)
- Vite 7.1.4 — Dev server and bundler (`apps/client/vite.config.ts`)
- Tailwind CSS 4.2.1 — Utility CSS (via `@tailwindcss/vite` Vite plugin)
- AWS Amplify 6.16.2 — Auth UI and Cognito integration (`apps/client/`)
- `@aws-amplify/ui-react` ^6.15.2 — Amplify React components

**Shared Model:**
- `@packpixie/model` — Internal workspace package (`packages/model/`)
  - Plain TypeScript types, no runtime dependencies
  - Consumed by both `apps/api` and `apps/client`

**Testing:**
- Not configured — API test script exits with error (`"test": "echo \"Error: no test specified\" && exit 1"`)

**Build/Dev:**
- Turbo 2.5.6 — Monorepo task orchestration (`turbo.json`)
  - Task graph: `build` depends on `^build` (packages built first)
  - `dev` is persistent and non-cached
- tsx 4.20.5 — TypeScript execution for API dev mode (`tsx watch src/index.ts`)
- Husky 9.1.7 — Git hooks (root `package.json`)

## Key Dependencies

**Critical (API):**
- `aws-jwt-verify` ^5.1.1 — Cognito JWT verification without SDK overhead (`apps/api/src/plugins/auth.ts`)
- `@aws-sdk/client-dynamodb` ^3.962.0 — DynamoDB low-level client
- `@aws-sdk/lib-dynamodb` ^3.962.0 — DynamoDB Document client (marshalling)
- `dotenv` ^17.3.1 — Env var loading in local dev

**Critical (Client):**
- `aws-amplify` ^6.16.2 — Cognito auth session management (`apps/client/src/api/api.ts`)
- `fetchAuthSession` from `aws-amplify/auth` — Retrieves Cognito ID tokens for API calls

## Configuration

**Environment (API — `apps/api/src/index.ts` and `apps/api/src/lib/dynamodb.ts`):**
- `DYNAMODB_TABLE` — DynamoDB table name (required)
- `COGNITO_USER_POOL_ID` — Cognito user pool ID (required)
- `COGNITO_CLIENT_ID` — Cognito client ID (required)
- `AWS_REGION` — AWS region (default: `us-east-1`)
- `LOCAL_DYNAMODB_URL` — Local DynamoDB endpoint for dev (optional, enables local mode)
- `NODE_ENV` — Drives log level and CORS origin
- `PORT` — Local server port (default: 3001)
- `HOST` — Local server host (default: `0.0.0.0`)
- `AWS_LAMBDA_FUNCTION_NAME` — Presence suppresses local HTTP server start

**Environment (Client — `apps/client/src/config.ts`, loaded via `import.meta.env`):**
- `VITE_APP_VERSION` — Application version string (required)
- `VITE_API_URL` — API base URL (required)
- `VITE_COGNITO_USER_POOL_ID` — Cognito user pool ID (required)
- `VITE_COGNITO_USER_POOL_CLIENT_ID` — Cognito client ID (required)
- All client env vars are validated at startup; missing vars trigger `alert()` + thrown error

**Build:**
- `apps/api/tsconfig.json` — ES2022 target, ESNext modules, strict mode
- `apps/client/tsconfig.app.json` + `tsconfig.node.json` — Split config for app vs node
- `packages/model/tsconfig.json` — Builds to `dist/` with declarations

## Platform Requirements

**Development:**
- Node.js (ESM-compatible)
- pnpm 10.12.1
- Docker (for DynamoDB Local on port 8000)
- AWS CLI (for local DynamoDB table setup)

**Production:**
- AWS Lambda (API)
- AWS S3 (static client hosting)
- AWS API Gateway v2 (HTTP API fronting Lambda)
- Terraform >= AWS provider ~6.12 (infra provisioning)

---

*Stack analysis: 2026-06-27*
