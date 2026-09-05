# PackPixie E2E Tests

End-to-end tests using Playwright. Running `pnpm test:e2e` starts the full application
stack automatically — no manual pre-steps required beyond the one-time setup below.

## Prerequisites

- **Docker** — required for DynamoDB Local, started automatically by `start-dynamodb-local.sh`
- **Node.js ≥ 20.11** and **pnpm ≥ 10** (standard repo requirements)
- A deployed PackPixie Cognito User Pool (the E2E test user is provisioned by Terraform — see `infra/cognito.tf`)
- AWS credentials configured locally with `secretsmanager:GetSecretValue` on `pack-pixie/*` (used by `setup-env.sh`)

## One-Time Setup

### 1. Configure environment variables

Run `setup-env.sh` — it reads the Cognito IDs and the test-user credentials from AWS
Secrets Manager and writes `.env.test`. Requires AWS credentials in your environment
(a configured profile/SSO with `secretsmanager:GetSecretValue` on `pack-pixie/*`):

```bash
./apps/e2e/setup-env.sh
```

The test user is provisioned by Terraform (`infra/cognito.tf`) — you don't create it
manually. The script is idempotent; re-run it any time to refresh `.env.test`.

| Variable               | Source                                                   |
| ---------------------- | -------------------------------------------------------- |
| `COGNITO_USER_POOL_ID` | Secrets Manager `pack-pixie/cognito-user-pool-id`        |
| `COGNITO_CLIENT_ID`    | Secrets Manager `pack-pixie/cognito-user-pool-client-id` |
| `TEST_USER_EMAIL`      | Secrets Manager `pack-pixie/e2e-test-user-email`         |
| `TEST_USER_PASSWORD`   | Secrets Manager `pack-pixie/e2e-test-user-password`      |

Leave `DYNAMODB_TABLE`, `LOCAL_DYNAMODB_URL`, `VITE_APP_VERSION`, and `VITE_API_URL`
at their default values unless you have a specific reason to change them.

## Running Tests

```bash
# From the repo root
pnpm test:e2e

# Playwright UI mode (interactive test development)
cd apps/e2e && pnpm exec playwright test --ui
```

`pnpm test:e2e` automatically performs all these steps before any test runs:

1. Starts DynamoDB Local in Docker on host port 8000 (`start-dynamodb-local.sh`), with `-sharedDb` so the API and the test harness share one database (see Troubleshooting for why this flag is mandatory) — reuses an already-running container across repeated local runs instead of starting a new one each time
2. Starts the Fastify API on port 3001 (connected to DynamoDB Local) and the Vite dev server on port 5173 — must happen after step 1, since the API checks DynamoDB connectivity on its own startup
3. Creates the `packpixie-test` DynamoDB table with the production schema (PK/SK + GSI1)
4. Logs in the Cognito test user through the browser UI and saves the session to `.auth/user.json`
5. Runs all tests — each test starts already authenticated
6. Deletes the DynamoDB table on exit (the container itself is left running for the next run — remove it with `docker rm -f packpixie-e2e-dynamodb-local`)

## CI

In GitHub Actions the workflow configures AWS credentials and runs `setup-env.sh`,
generating `.env.test` from Secrets Manager exactly as it does locally. The only
repository secrets required are `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. See
`.github/workflows/e2e.yml` for the full CI pipeline.

## Setting up CI

### Required GitHub secrets

The E2E workflow only needs AWS credentials — it reads everything else from Secrets Manager. Add these (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret name | Where to find the value |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID` | CI IAM user key: `terraform output github_actions_access_key_id` (run from `infra/`) |
| `AWS_SECRET_ACCESS_KEY` | `terraform output -raw github_actions_secret_access_key` (run from `infra/`) |

The Cognito IDs and test-user credentials live in AWS Secrets Manager under `pack-pixie/*` (provisioned by Terraform), so they are **not** GitHub secrets — the IAM user's existing `secretsmanager:GetSecretValue` on `pack-pixie/*` covers them.

### Branch protection

The workflow job is named **e2e** under the workflow **E2E Tests**. To make it a required status check on `main`:

1. Go to **Settings → Branches → Branch protection rules → main**
2. Enable **Require status checks to pass before merging**
3. Search for and add **`E2E Tests / e2e`**

With this configured, PRs cannot merge if the E2E job fails.

## Troubleshooting

**Port 8000 already in use**
DynamoDB Local requires host port 8000. `start-dynamodb-local.sh` reuses its own
container (`packpixie-e2e-dynamodb-local`) across runs, but something else — most
often a manually-started DynamoDB Local for regular app development (see the root
README) — can already be holding port 8000:

```bash
docker ps --filter publish=8000   # identify what's holding the port
docker rm -f packpixie-e2e-dynamodb-local  # remove the e2e container specifically
```

**"storageState file not found" error**
The file `.auth/user.json` is created by global setup during the Cognito login step. If
it is missing, global setup failed — check the Playwright console output for the error
message. Fix the underlying issue and re-run `pnpm test:e2e`.

**API fails to start / "webServer" times out after 30 seconds**
If `COGNITO_USER_POOL_ID` or `COGNITO_CLIENT_ID` are blank in `.env.test`, the API
throws `Error: Cognito user pool ID is required` immediately on startup and exits.
Playwright's webServer health check then times out after 30s with a generic error.
Fix: fill in both Cognito values in `.env.test` before running tests.

**Cognito login times out or fails**
Verify that `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` in `.env.test` match the
Terraform-provisioned test user (stored in Secrets Manager under
`pack-pixie/e2e-test-user-*`). Re-run `setup-env.sh` to refresh them.

**API returns 500 "Cannot do operations on a non-existent table"**
This is the failure mode `-sharedDb` prevents — if you remove that flag from
`start-dynamodb-local.sh`, expect it to return.

DynamoDB Local in `-inMemory` mode, **without** `-sharedDb`, does not keep one database.
It silently partitions storage into a separate hidden database per **(AWS access key ID +
region)**. A table created under one identity is invisible to a client using a different
one, even on the same `localhost:8000`.

Both clients now pin the same fake identity, but `-sharedDb` guarantees a single database
regardless of any future credential or region drift:

- **Test harness** (`src/db/init.ts`) pins fake credentials
  `{ accessKeyId: 'local', secretAccessKey: 'local' }` and region `AWS_REGION`, creating the
  table in namespace `("local", AWS_REGION)`.
- **API** (`apps/api/src/lib/dynamodb.ts`) pins the same fake credentials whenever
  `LOCAL_DYNAMODB_URL` is set, so it shares that namespace. (In production — no
  `LOCAL_DYNAMODB_URL` — it uses the Lambda execution role via the default provider chain.)
  Historically the API used the default chain here too, which on a machine with real AWS
  credentials landed it in a *different* namespace — the original cause of this 500.

`-sharedDb` collapses the instance to a single database that every client shares regardless
of credentials or region, eliminating the split. It is scoped to the e2e test container
(`packpixie-e2e-dynamodb-local`, `-inMemory` so its data doesn't survive a restart) only —
it does **not** affect any DynamoDB you run for local app development (separate container,
separate data). The auth test passes without the flag because it never touches DynamoDB;
only the trip test exercises a real DB write.
