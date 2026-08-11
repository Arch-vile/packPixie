# Phase 2 Research: Stack Orchestration + DB Initialization

**Researched:** 2026-06-28
**Domain:** testcontainers, Playwright webServer, DynamoDB CreateTable, Playwright globalSetup auth
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01/D-02:** testcontainers-node (`testcontainers` package) to start `amazon/dynamodb-local`
- **D-03/D-04/D-05/D-06:** Playwright `webServer` config (array) for both API and Vite servers
- **D-07/D-08:** Browser UI login through Amplify UI form; storageState → `.auth/user.json`
- **D-09:** Credentials from env vars: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`
- **D-10:** Auth runs once in global-setup; tests reuse saved storageState
- **D-11:** DynamoDB table: PK/SK + GSI1 (GSI1PK/GSI1SK), BillingMode PAY_PER_REQUEST
- **D-12:** globalTeardown deletes the table and stops the container
</user_constraints>

---

## Summary

The key architectural insight for this phase is the **ordering dependency** between `webServer` and `globalSetup`: Playwright starts `webServer` processes (API, Vite) and waits for their health URLs *before* running `globalSetup`. This means DynamoDB Local is not yet running when the API server starts. The solution: (1) load `.env.test` inside `playwright.config.ts` so env vars are set before webServer starts, (2) use a **fixed host port (8000)** for DynamoDB Local via testcontainers' `{ container: 8000, host: 8000 }` syntax, and (3) rely on the fact that the API's DynamoDB client does not make network calls until the first query — the `/health` endpoint (used by webServer's `url` check) does not touch DynamoDB.

**Version summary:** `testcontainers@12.0.2` (15d old, ✓), `dotenv@17.3.1` (135d old, ✓), `@aws-sdk/client-dynamodb@^3.962.0` already locked in pnpm-lock.yaml (safe to add to apps/e2e).

---

## Key Findings

### 1. testcontainers-node version constraint

`npm view testcontainers time` results (checked 2026-06-28):
- `12.0.3` → 10d old → **BLOCKED** (minimumReleaseAge: 14d)
- `12.0.2` → 15d old → **OK ✓**
- `12.0.1` → 31d old → OK
- `11.14.0` → 80d old → OK

**Use `"testcontainers": "12.0.2"` (exact, no `^`)** — same reason as Playwright: `^` could upgrade to the blocked 12.0.3.

---

### 2. Critical ordering issue: webServer vs DynamoDB Local

**Problem:** Playwright's execution order is:
1. Load `playwright.config.ts` → start `webServer` processes → wait for health URLs
2. Run `globalSetup`
3. Run tests
4. Run `globalTeardown`
5. Stop `webServer` processes

DynamoDB Local is started in `globalSetup` (step 2), but the API needs `LOCAL_DYNAMODB_URL` set when it starts (step 1).

**Solution (3 parts working together):**

**Part A — Load `.env.test` inside `playwright.config.ts`:**
```typescript
// apps/e2e/playwright.config.ts (add at top)
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(__dirname, '.env.test'), override: false });
```
This runs before anything else. `process.env` now has `LOCAL_DYNAMODB_URL=http://localhost:8000` before webServer starts.

**Part B — Use fixed port 8000 in testcontainers:**
```typescript
// apps/e2e/global-setup.ts
const container = await new GenericContainer('amazon/dynamodb-local')
  .withExposedPorts({ container: 8000, host: 8000 }) // testcontainers v10+ syntax
  .start();
```
The `{ container: N, host: N }` object syntax for `withExposedPorts` forces a specific host port. Available since testcontainers-node v10.

**Part C — The API's `/health` endpoint doesn't touch DynamoDB:**
```typescript
// apps/api/src/index.ts (existing)
fastify.get('/health', async (_request, _reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});
```
The webServer health check hits `/health`, which passes without DynamoDB. By the time tests run (after globalSetup), DynamoDB Local is ready at port 8000.

---

### 3. webServer config in playwright.config.ts

```typescript
// apps/e2e/playwright.config.ts
webServer: [
  {
    command: 'pnpm --filter api dev',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DYNAMODB_TABLE: process.env.DYNAMODB_TABLE ?? 'packpixie-test',
      LOCAL_DYNAMODB_URL: process.env.LOCAL_DYNAMODB_URL ?? 'http://localhost:8000',
      COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ?? '',
      COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? '',
    },
  },
  {
    command: 'pnpm --filter client dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: {
      ...process.env,
      VITE_APP_VERSION: process.env.VITE_APP_VERSION ?? 'test',
      VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:3001',
      VITE_COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ?? '',
      VITE_COGNITO_USER_POOL_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? '',
    },
  },
],
```

**Notes:**
- `command` strings run from the **repo root** when invoked via `turbo run e2e` (Turbo invokes pnpm in `apps/e2e/`, but `pnpm --filter` commands run relative to the monorepo root).
- `webServer.env` is NOT merged with `process.env` by default — you must spread `...process.env` explicitly.
- `reuseExistingServer: !process.env.CI` — reuse if already running locally; always fresh in CI.
- API dev script: `tsx watch src/index.ts` (from `apps/api/package.json`). Port: `3001` (default in `apps/api/src/index.ts`).
- Vite dev script: `vite` (from `apps/client/package.json`). Port: `5173` (Vite default).
- `VITE_APP_VERSION` is required by `apps/client/src/config.ts` — must be set or the client throws on startup.

---

### 4. DynamoDB CreateTable (AWS SDK v3)

`@aws-sdk/client-dynamodb@3.962.0` is already locked in `pnpm-lock.yaml`. Add it to `apps/e2e/package.json` devDependencies with `"^3.962.0"` — pnpm will reuse the already-cached version.

```typescript
// apps/e2e/src/db/init.ts
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';

export function createTestDynamoDBClient() {
  return new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.LOCAL_DYNAMODB_URL ?? 'http://localhost:8000',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}

export async function createTable(client: DynamoDBClient) {
  const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';
  await client.send(new CreateTableCommand({
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [{
      IndexName: 'GSI1',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    }],
    BillingMode: 'PAY_PER_REQUEST',
  }));
}

export async function deleteTable(client: DynamoDBClient) {
  const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
}
```

**DynamoDB Local credentials:** DynamoDB Local ignores credentials but the SDK requires them. Use `{ accessKeyId: 'local', secretAccessKey: 'local' }`.

---

### 5. global-setup: sharing container with global-teardown

Playwright runs `globalSetup` and `globalTeardown` in separate Node.js processes in some configurations, so `global` variables don't survive. The reliable pattern is to **write the container state to a temp file**:

```typescript
// apps/e2e/global-setup.ts
import { writeFileSync } from 'fs';
import { join } from 'path';
import { GenericContainer } from 'testcontainers';
import type { FullConfig } from '@playwright/test';

const STATE_FILE = join(import.meta.dirname, '.e2e-state.json');

export default async function globalSetup(_config: FullConfig) {
  // 1. Start DynamoDB Local
  const container = await new GenericContainer('amazon/dynamodb-local')
    .withExposedPorts({ container: 8000, host: 8000 })
    .start();

  // 2. Write container ID for teardown
  writeFileSync(STATE_FILE, JSON.stringify({ containerId: container.getId() }));

  // 3. Create table + seed (see src/db/init.ts and src/db/seed.ts)
  // ...

  // 4. Browser auth (see below)
  // ...
}
```

```typescript
// apps/e2e/global-teardown.ts
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { FullConfig } from '@playwright/test';

const STATE_FILE = join(import.meta.dirname, '.e2e-state.json');

export default async function globalTeardown(_config: FullConfig) {
  try {
    const { containerId } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    // testcontainers can stop by ID via Docker API
    const { GenericContainer } = await import('testcontainers');
    // Note: testcontainers v12 auto-cleans via Ryuk reaper on process exit.
    // Explicit stop is belt-and-suspenders.
    const { Exec } = await import('testcontainers');
    // Simpler: use dockerode directly, or just rely on Ryuk
  } catch { /* already cleaned up */ }
  try { unlinkSync(STATE_FILE); } catch {}
}
```

**Important:** testcontainers v10+ includes the **Ryuk reaper container** which auto-stops all testcontainers containers when the Node process exits. This means even if `globalTeardown` doesn't explicitly stop the container, it will be cleaned up. Explicit stop is belt-and-suspenders only.

**Simplest teardown:** Just delete the table and rely on Ryuk for container cleanup:
```typescript
// global-teardown.ts
export default async function globalTeardown(_config: FullConfig) {
  const client = createTestDynamoDBClient();
  await deleteTable(client);
  // Container is cleaned up by Ryuk automatically
}
```

---

### 6. Playwright browser UI auth in globalSetup

Playwright `chromium.launch()` is available in globalSetup via the `@playwright/test` package's `chromium` export:

```typescript
// apps/e2e/global-setup.ts (auth section)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const AUTH_STATE_PATH = join(import.meta.dirname, '.auth', 'user.json');

async function loginAndSaveState() {
  mkdirSync(join(import.meta.dirname, '.auth'), { recursive: true });

  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set');
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseURL);

  // Amplify UI Authenticator component selectors (stable data attributes)
  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for successful login — URL change or dashboard element
  await page.waitForURL('**/', { timeout: 30000 });

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
```

**Amplify Authenticator selectors:** The Amplify UI `<Authenticator>` component renders standard `<input type="email">` and `<input type="password">` fields plus a `<button type="submit">` with "Sign in" text. `getByRole('textbox', { name: /email/i })` is stable across Amplify versions.

---

### 7. playwright.config.ts additions (globalSetup + globalTeardown + storageState)

```typescript
// Add to existing defineConfig:
globalSetup: './global-setup.ts',
globalTeardown: './global-teardown.ts',

use: {
  // existing...
  storageState: '.auth/user.json', // all tests start authenticated
},
```

**Note:** `storageState` in `use` applies globally to all tests. Individual tests that need to test unauthenticated flows should override with `storageState: undefined` in their test fixture.

---

### 8. .env.test structure

```bash
# DynamoDB
DYNAMODB_TABLE=packpixie-test
LOCAL_DYNAMODB_URL=http://localhost:8000
AWS_REGION=us-east-1

# API
PORT=3001

# Cognito (populate before running tests locally)
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

# Auth (populate with test user credentials)
TEST_USER_EMAIL=
TEST_USER_PASSWORD=

# Client
VITE_APP_VERSION=test
VITE_API_URL=http://localhost:3001
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_USER_POOL_CLIENT_ID=
```

---

## Recommended Implementation Order

1. **Add deps to apps/e2e/package.json**: `testcontainers@12.0.2`, `dotenv@17.3.1`, `@aws-sdk/client-dynamodb@^3.962.0`
2. **Create apps/e2e/.env.example** (template with blank secrets)
3. **Create apps/e2e/src/db/init.ts** (createTable + deleteTable + createTestDynamoDBClient)
4. **Create apps/e2e/src/db/seed.ts** (seed one trip + one item)
5. **Create apps/e2e/src/auth/login.ts** (loginAndSaveState helper)
6. **Create apps/e2e/global-setup.ts** (orchestrates: start container → create table → seed → login)
7. **Create apps/e2e/global-teardown.ts** (delete table; Ryuk handles container)
8. **Update apps/e2e/playwright.config.ts** (add dotenv load, globalSetup/Teardown, webServer, storageState)
9. **Update apps/e2e/.gitignore** (add `.auth/`, `.env.test`, `.e2e-state.json`)

---

## Pitfalls to Avoid

- **Port 8000 conflict:** If something else is running on port 8000 locally, the test fails. Document this in the README. On CI it's fine (fresh environment).
- **`webServer.env` doesn't spread automatically** — must explicitly spread `...process.env` or env vars from `.env.test` won't reach the servers.
- **DynamoDB Local requires fake credentials** — the AWS SDK refuses to send requests without credentials, even to local endpoints. Use `{ accessKeyId: 'local', secretAccessKey: 'local' }`.
- **`VITE_APP_VERSION` is required** by `apps/client/src/config.ts` — set it to `'test'` in `.env.test` or Vite build fails.
- **Amplify auth form timing** — the Amplify Authenticator can take a moment to hydrate. Add `await page.waitForSelector('[data-amplify-authenticator]', { timeout: 10000 })` before filling the form if needed.
- **`.auth/user.json` must exist before tests run** — created by globalSetup. If globalSetup fails, tests fail with "storageState file not found". Add a guard in playwright.config.ts or a clear error message.
- **testcontainers requires Docker** — document in README. CI must have Docker available (GitHub Actions runners do by default).

## RESEARCH COMPLETE
