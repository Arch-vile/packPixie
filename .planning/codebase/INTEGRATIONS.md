# External Integrations

**Analysis Date:** 2026-06-27

## APIs & External Services

**AWS DynamoDB:**
- Purpose: Primary data store — single-table design with PK/SK keys and GSI1
- SDK: `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (Document client)
- Client factory: `apps/api/src/lib/dynamodb.ts`
- Auth: IAM role assumed by Lambda execution role (no explicit credentials in code)
- Local dev: Override endpoint via `LOCAL_DYNAMODB_URL` env var (DynamoDB Local on Docker)

**AWS Cognito:**
- Purpose: User authentication and identity (sign-up, sign-in, token issuance)
- Pool type: User pool with SRP auth flows; no client secret (SPA-compatible)
- Token use: ID token verified server-side; access token not used
- API verification: `aws-jwt-verify` `CognitoJwtVerifier` in `apps/api/src/plugins/auth.ts`
- Client integration: AWS Amplify `fetchAuthSession` in `apps/client/src/api/api.ts`
- Config: `userPoolId` + `clientId` (no secret)
- Auth flows: `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`
- Token validity: Access/ID = 1 hour, Refresh = 30 days

## Data Storage

**Databases:**
- AWS DynamoDB (single-table design)
  - Table name: `pack-pixie-{suffix}` (production) / `packpixie-local` (development)
  - Connection env var: `DYNAMODB_TABLE`
  - Billing: PAY_PER_REQUEST (on-demand)
  - Keys: PK (hash), SK (range); GSI1 with GSI1PK/GSI1SK
  - Features: Point-in-time recovery enabled, server-side encryption (AES256), TTL on `TTL` attribute
  - Operations used: `QueryCommand`, `PutCommand`, `TransactWriteCommand`, `BatchWriteCommand`, `DescribeTableCommand`

**File Storage:**
- AWS S3 (two buckets):
  - Client app static hosting: `pack-pixie-client-app-{suffix}` — S3 website endpoint
  - Lambda deployment packages: `pack-pixie-lambda-deployments-{suffix}` — versioning enabled, AES256 encryption, public access blocked

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- AWS Cognito
  - Implementation: Hosted user pool (no hosted UI); Amplify handles SRP client-side
  - Sign-in identifier: Email (case-insensitive)
  - Email verification: Required (OTP code, 24-hour expiry)
  - Password policy: Min 8 chars, uppercase + lowercase + numbers required
  - Account recovery: Verified email only
  - Deletion protection: ACTIVE (prevents accidental pool destruction)
  - Server-side guard: `authPlugin` in `apps/api/src/plugins/auth.ts` — wraps protected route scope via `fastify-plugin`
  - Claims extracted: `sub` (user ID), `email`
  - User identity source: Always from verified JWT claims (`request.user`), never from request params

## Monitoring & Observability

**Logging:**
- AWS CloudWatch — Lambda log group: `/aws/lambda/pack-pixie-api-{suffix}`
- Retention: 14 days
- Fastify built-in logger: `debug` level locally, `info` level in production (controlled by `NODE_ENV`)

**Error Tracking:**
- None (no Sentry, Datadog, or equivalent)

**Metrics:**
- None beyond CloudWatch default Lambda metrics

## CI/CD & Deployment

**API Hosting:**
- AWS Lambda — function name `pack-pixie-api-{suffix}`
- Fronted by AWS API Gateway v2 (HTTP API)
- Deployment: `scripts/deploy-lambda.sh` — builds TypeScript, bundles production deps, zips, uploads to S3, updates Lambda function code

**Client Hosting:**
- AWS S3 static website — `pack-pixie-client-app-{suffix}`
- CloudFront: Referenced in architecture docs; TF config at `infra/client-s3.tf`

**CI Pipeline:**
- GitHub Actions — IAM user `github-actions-deploy-{suffix}` with access key provisioned by Terraform
- IAM permissions: S3 PutObject/GetObject/DeleteObject/ListBucket on client bucket; `secretsmanager:GetSecretValue` on `pack-pixie/*` secrets

**Infrastructure:**
- Terraform (AWS provider ~6.12)
- State backend: S3 (`infra/backend.hcl`)
- Entrypoint: `infra/main.tf`

## Environment Configuration

**Required API env vars:**
- `DYNAMODB_TABLE` — DynamoDB table name
- `COGNITO_USER_POOL_ID` — Cognito user pool ID
- `COGNITO_CLIENT_ID` — Cognito app client ID
- `AWS_REGION` — AWS region (default: `us-east-1`)

**Optional API env vars (local dev):**
- `LOCAL_DYNAMODB_URL` — e.g. `http://localhost:8000` (enables local DynamoDB)
- `PORT` — HTTP server port (default: 3001)
- `HOST` — HTTP server host (default: `0.0.0.0`)

**Required client env vars (Vite `VITE_` prefix):**
- `VITE_APP_VERSION` — Version string
- `VITE_API_URL` — API base URL
- `VITE_COGNITO_USER_POOL_ID` — Cognito user pool ID
- `VITE_COGNITO_USER_POOL_CLIENT_ID` — Cognito app client ID

**Secrets location:**
- AWS Secrets Manager under `pack-pixie/*` namespace (GitHub Actions has read access)
- No `.env` files committed; env vars injected at Lambda runtime and via Vite build

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-06-27*
