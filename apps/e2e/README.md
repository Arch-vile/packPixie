# PackPixie E2E Tests

End-to-end tests using Playwright + testcontainers. Running `pnpm test:e2e` starts the
full application stack automatically — no manual pre-steps required beyond the one-time
setup below.

## Prerequisites

- **Docker** — required for DynamoDB Local, started automatically via testcontainers
- **Node.js ≥ 20.11** and **pnpm ≥ 10** (standard repo requirements)
- A deployed PackPixie Cognito User Pool (dev environment pool is fine)

## One-Time Setup

### 1. Configure environment variables and create the test user

Run `setup-env.sh` from the e2e root — it pulls Cognito values from Terraform, writes `.env.test`, and creates the Cognito test user in one step:

```bash
./apps/e2e/setup-env.sh you@example.com YourPass123!
```

The script is idempotent — safe to re-run if you need to update credentials.

| Variable               | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `COGNITO_USER_POOL_ID` | Pulled automatically from `terraform output`      |
| `COGNITO_CLIENT_ID`    | Pulled automatically from `terraform output`      |
| `TEST_USER_EMAIL`      | First argument (or `TEST_USER_EMAIL` env var)     |
| `TEST_USER_PASSWORD`   | Second argument (or `TEST_USER_PASSWORD` env var) |

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

1. Starts DynamoDB Local in Docker on host port 8000 (via testcontainers)
2. Starts the Fastify API on port 3001 (connected to DynamoDB Local)
3. Starts the Vite dev server on port 5173
4. Creates the `packpixie-test` DynamoDB table with the production schema (PK/SK + GSI1)
5. Seeds one test trip, one participant, and one packing item
6. Logs in the Cognito test user through the browser UI and saves the session to `.auth/user.json`
7. Runs all tests — each test starts already authenticated
8. Deletes the DynamoDB table and cleans up containers on exit

## CI

In GitHub Actions, environment variables are injected from repository secrets — no
`.env.test` file is used. Required secrets: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`,
`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`. See `.github/workflows/e2e.yml` (Phase 3)
for the full CI pipeline.

## Setting up CI

### Required GitHub secrets

Add the following four secrets to the repository (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret name | Where to find the value |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `COGNITO_USER_POOL_ID` | AWS Console → Cognito → User Pools → select pool → **Pool ID**. Or: `terraform output -raw cognito_user_pool_id` (run from `infra/`) |
| `COGNITO_CLIENT_ID` | AWS Console → Cognito → User Pools → select pool → App clients → **Client ID**. Or: `terraform output -raw cognito_user_pool_client_id` (run from `infra/`) |
| `TEST_USER_EMAIL` | The email address of the Cognito test user (same value as in your local `.env.test`) |
| `TEST_USER_PASSWORD` | The password of the Cognito test user (same value as in your local `.env.test`) |

### Branch protection

The workflow job is named **e2e** under the workflow **E2E Tests**. To make it a required status check on `main`:

1. Go to **Settings → Branches → Branch protection rules → main**
2. Enable **Require status checks to pass before merging**
3. Search for and add **`E2E Tests / e2e`**

With this configured, PRs cannot merge if the E2E job fails.

## Troubleshooting

**Port 8000 already in use**
DynamoDB Local requires host port 8000. If another process is using it:

```bash
lsof -i :8000        # identify the process
kill -9 <PID>        # stop it
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
Verify that `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` in `.env.test` match the user
you created in step 2. The permanent password must have been set with
`admin-set-user-password --permanent` — a temporary password will fail.
