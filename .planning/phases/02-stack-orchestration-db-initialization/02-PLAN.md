---
phase: 02-stack-orchestration-db-initialization
plan: "01-04"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/e2e/package.json
  - apps/e2e/tsconfig.json
  - apps/e2e/.env.example
  - apps/e2e/.gitignore
  - apps/e2e/src/db/init.ts
  - apps/e2e/src/db/seed.ts
  - apps/e2e/src/auth/login.ts
  - apps/e2e/global-setup.ts
  - apps/e2e/global-teardown.ts
  - apps/e2e/playwright.config.ts
  - apps/e2e/README.md
autonomous: true
requirements:
  - ORCH-01
  - ORCH-02
  - ORCH-03
  - ORCH-04
  - ORCH-05
  - DB-01
  - DB-02
  - DB-03
  - DB-04
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04
must_haves:
  truths:
    - pnpm test:e2e starts DynamoDB Local on port 8000 before any test runs (D-01, D-02, ORCH-01)
    - API server starts on port 3001 with LOCAL_DYNAMODB_URL=http://localhost:8000 before tests run (D-03, D-05, ORCH-02)
    - Vite dev server starts on port 5173 with VITE_APP_VERSION and VITE_API_URL set before tests run (D-04, D-06, ORCH-03)
    - DynamoDB table packpixie-test exists with PK/SK primary key and GSI1 (GSI1PK/GSI1SK) before any test runs (D-11, DB-01)
    - One test trip, one participant, and one item are seeded to the table before tests run (DB-02)
    - Cognito test user is logged in via browser UI; .auth/user.json exists before tests run (D-07, D-08, AUTH-02, AUTH-03)
    - All tests start authenticated via use.storageState referencing .auth/user.json (D-10)
    - globalTeardown deletes the DynamoDB table on exit; Ryuk reaper cleans up the container (D-12, D-13, ORCH-04)
    - Re-running pnpm test:e2e immediately after a run does not fail due to leftover table or container state (ORCH-05)
    - Missing TEST_USER_EMAIL produces a clear error before any test starts (D-09, AUTH-01)
  artifacts:
    - apps/e2e/global-setup.ts
    - apps/e2e/global-teardown.ts
    - apps/e2e/src/db/init.ts
    - apps/e2e/src/db/seed.ts
    - apps/e2e/src/auth/login.ts
    - apps/e2e/playwright.config.ts (updated from Phase 1)
    - apps/e2e/.env.example
    - apps/e2e/README.md
  key_links:
    - playwright.config.ts dotenv load (top of file) → process.env.LOCAL_DYNAMODB_URL set before webServer spawns
    - webServer entries spread ...process.env explicitly → COGNITO vars reach Fastify config.ts and Vite config.ts
    - global-setup.ts withExposedPorts({container:8000, host:8000}) → fixed host port matches LOCAL_DYNAMODB_URL=http://localhost:8000
    - global-setup.ts loginAndSaveState() writes .auth/user.json → playwright.config.ts use.storageState reads it
    - VITE_APP_VERSION=test in .env.test → client/src/config.ts requireEnv('VITE_APP_VERSION') does not throw
    - deleteTable swallows ResourceNotFoundException → globalTeardown is idempotent (ORCH-05)
---

<objective>
Phase 2: Stack Orchestration + DB Initialization

Before any test runs: DynamoDB Local starts via testcontainers on port 8000, the packpixie-test
DynamoDB table is created with the correct PK/SK/GSI1 schema, test data is seeded, the Fastify
API and Vite dev server start via Playwright webServer config, and a Cognito test user logs in
through the browser UI with the session saved to .auth/user.json.

Purpose: Enables pnpm test:e2e to start the full application stack automatically without any
manual pre-steps. Phase 3 (CI pipeline) and Phase 4 (baseline tests) build on top of this.

Output:
  New files: global-setup.ts, global-teardown.ts, src/db/init.ts, src/db/seed.ts,
             src/auth/login.ts, .env.example, README.md
  Updated:   package.json (3 new devDeps), tsconfig.json (expanded include),
             playwright.config.ts (dotenv, globalSetup/Teardown, webServer, storageState),
             .gitignore (.auth/ .env.test .e2e-state.json)

Wave structure:
  Wave 1 (run in parallel): Plan 1 (deps + config files), Plan 2 (DB layer + auth helper)
  Wave 2 (run in parallel, after Wave 1): Plan 3 (global-setup/teardown), Plan 4 (playwright.config.ts + README)
</objective>

<execution_context>
@.github/gsd-core/workflows/execute-plan.md
@.github/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-playwright-package-foundation/01-SUMMARY.md
@.planning/phases/02-stack-orchestration-db-initialization/02-CONTEXT.md
@.planning/phases/02-stack-orchestration-db-initialization/02-RESEARCH.md
@dynamoDB-architecture.md
@apps/api/src/index.ts
@apps/api/src/config.ts
@apps/api/src/lib/dynamodb.ts
@apps/client/src/config.ts
@apps/e2e/package.json
@apps/e2e/playwright.config.ts
@apps/e2e/tsconfig.json
</context>

---

## Plan 1 of 4 — Wave 1: Dependencies + Configuration Files

**Wave:** 1 | **Depends on:** none | **Parallel with:** Plan 2
**Files:** `apps/e2e/package.json`, `apps/e2e/tsconfig.json`, `apps/e2e/.env.example`, `apps/e2e/.gitignore`
**Requirements:** ORCH-01 (testcontainers install), DB-04 (env vars), AUTH-01 (TEST_USER_EMAIL documented)

<tasks>

<task type="auto">
  <name>Task 1.1: Add devDependencies to apps/e2e/package.json and run pnpm install</name>
  <files>apps/e2e/package.json</files>
  <action>
    Add three devDependencies to `apps/e2e/package.json` in the `devDependencies` block alongside
    the existing `@playwright/test`:

    "testcontainers": "12.0.2"
      Exact pin, NO caret. Version 12.0.3 is 10d old as of 2026-06-28 and is blocked by the
      repo's pnpm minimumReleaseAge: 14d constraint (same rule that pinned @playwright/test to
      1.60.0 in Phase 1). Version 12.0.2 is 15d old — passes the constraint. (D-01, ORCH-01)

    "dotenv": "17.3.1"
      Exact pin. Matches the version already in apps/api/package.json. Used to load .env.test
      inside playwright.config.ts before webServer starts.

    "@aws-sdk/client-dynamodb": "^3.962.0"
      Range is safe — this exact version is already locked in the repo's pnpm-lock.yaml (used by
      apps/api), so pnpm will reuse the cached resolution without a network fetch. Do NOT add
      @aws-sdk/lib-dynamodb — the e2e layer uses raw DynamoDBClient (not DocumentClient) for DDL.

    "@types/node": "^20.14.0"
      Needed for import.meta.dirname TypeScript type support (Node 20.11+ API). Playwright's
      transform handles the runtime, but @types/node provides IDE type checking.

    The complete updated devDependencies block must be:
      "@playwright/test": "1.60.0",
      "@types/node": "^20.14.0",
      "@aws-sdk/client-dynamodb": "^3.962.0",
      "testcontainers": "12.0.2",
      "dotenv": "17.3.1"

    After editing package.json, run from the repo root:
      pnpm install

    This resolves the new packages and updates pnpm-lock.yaml.
  </action>
  <verify>
    <automated>ls apps/e2e/node_modules/testcontainers/package.json && node -e "const p=require('./apps/e2e/node_modules/testcontainers/package.json'); console.log(p.version)" | grep "12.0.2" && echo "PASS"</automated>
  </verify>
  <done>pnpm install succeeds; apps/e2e/node_modules/testcontainers exists at version 12.0.2; apps/e2e/node_modules/dotenv exists; apps/e2e/node_modules/@aws-sdk/client-dynamodb exists.</done>
</task>

<task type="auto">
  <name>Task 1.2: Update apps/e2e/tsconfig.json to include new source paths</name>
  <files>apps/e2e/tsconfig.json</files>
  <action>
    The Phase 1 tsconfig.json only includes playwright.config.ts and tests/**/*. The new files
    (global-setup.ts, global-teardown.ts, src/**/*.ts) are not covered.

    Update the "include" array to add the new paths. Preserve all existing compilerOptions
    unchanged (target: ES2022, module: ESNext, moduleResolution: node, strict: true, etc.).

    Replace the "include" value from:
      ["playwright.config.ts", "tests/**/*"]
    with:
      ["playwright.config.ts", "global-setup.ts", "global-teardown.ts", "tests/**/*", "src/**/*"]

    This allows TypeScript language services (IDE autocomplete, type checking) to cover all e2e
    source files. Playwright's own transform handles runtime compilation independently.
  </action>
  <verify>
    <automated>node -e "const t=JSON.parse(require('fs').readFileSync('apps/e2e/tsconfig.json','utf8')); console.log(t.include.includes('src/**/*') ? 'PASS' : 'FAIL')"</automated>
  </verify>
  <done>apps/e2e/tsconfig.json include array contains "global-setup.ts", "global-teardown.ts", and "src/**/*".</done>
</task>

<task type="auto">
  <name>Task 1.3: Create apps/e2e/.env.example</name>
  <files>apps/e2e/.env.example</files>
  <action>
    Create apps/e2e/.env.example as a documentation template committed to git. Developers copy
    it to .env.test and fill in the secrets. The .env.test file itself is gitignored.

    Write this exact content to the file (variable assignments with blank values for secrets,
    defaults for non-sensitive values):

      # ─── DynamoDB Local ─────────────────────────────────────────────────────
      DYNAMODB_TABLE=packpixie-test
      LOCAL_DYNAMODB_URL=http://localhost:8000
      AWS_REGION=us-east-1

      # ─── API server ──────────────────────────────────────────────────────────
      PORT=3001

      # ─── Cognito (get from AWS Console → Cognito → User Pools) ──────────────
      COGNITO_USER_POOL_ID=
      COGNITO_CLIENT_ID=

      # ─── Test user credentials (create via AWS CLI — see README.md) ─────────
      TEST_USER_EMAIL=
      TEST_USER_PASSWORD=

      # ─── Vite client env vars ────────────────────────────────────────────────
      # VITE_APP_VERSION is required by apps/client/src/config.ts — must not be blank
      VITE_APP_VERSION=test
      VITE_API_URL=http://localhost:3001
      VITE_COGNITO_USER_POOL_ID=
      VITE_COGNITO_USER_POOL_CLIENT_ID=
  </action>
  <verify>
    <automated>test -f apps/e2e/.env.example && grep -q "DYNAMODB_TABLE=packpixie-test" apps/e2e/.env.example && grep -q "VITE_APP_VERSION=test" apps/e2e/.env.example && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/.env.example exists; contains DYNAMODB_TABLE, LOCAL_DYNAMODB_URL, COGNITO_USER_POOL_ID, TEST_USER_EMAIL, VITE_APP_VERSION defaults.</done>
</task>

<task type="auto">
  <name>Task 1.4: Update apps/e2e/.gitignore</name>
  <files>apps/e2e/.gitignore</files>
  <action>
    Append three new entries to apps/e2e/.gitignore. The current content is:
      node_modules/
      test-results/
      playwright-report/

    Append the following lines (with a blank separator):

      .auth/
      .env.test
      .e2e-state.json

    Rationale for each entry:
      .auth/          — Contains .auth/user.json with live Cognito session tokens (D-08)
      .env.test       — Contains real Cognito user pool IDs and test user passwords (D-09)
      .e2e-state.json — Testcontainers container ID written by global-setup.ts (D-02, D-13)

    The final .gitignore must contain all 6 lines (3 existing + 3 new).
  </action>
  <verify>
    <automated>grep -q "\.auth/" apps/e2e/.gitignore && grep -q "\.env\.test" apps/e2e/.gitignore && grep -q "\.e2e-state\.json" apps/e2e/.gitignore && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/.gitignore contains .auth/, .env.test, and .e2e-state.json entries in addition to the existing Phase 1 entries.</done>
</task>

</tasks>

---

## Plan 2 of 4 — Wave 1: DB Layer + Auth Helper

**Wave:** 1 | **Depends on:** none (files can be written before pnpm install completes) | **Parallel with:** Plan 1
**Files:** `apps/e2e/src/db/init.ts`, `apps/e2e/src/db/seed.ts`, `apps/e2e/src/auth/login.ts`
**Requirements:** DB-01 (createTable schema), DB-02 (seedTestData), DB-03 (deleteTable idempotent),
                  DB-04 (env vars), AUTH-01 (env var guard), AUTH-02 (login helper), AUTH-03 (storageState path)

NOTE: These new source files can be written while Plan 1 runs pnpm install. TypeScript type
checking (tsc --noEmit) requires packages to be installed first — run it after Plan 1 completes.
Playwright's runtime transform handles compilation independently of tsc.

<tasks>

<task type="auto">
  <name>Task 2.1: Create apps/e2e/src/db/init.ts</name>
  <files>apps/e2e/src/db/init.ts</files>
  <action>
    Create apps/e2e/src/db/init.ts with three exported functions used by global-setup.ts and
    global-teardown.ts. The directory apps/e2e/src/db/ must be created if it does not exist.

    CRITICAL constraints (from RESEARCH.md §4 and D-11):
    - Credentials MUST be { accessKeyId: 'local', secretAccessKey: 'local' }. DynamoDB Local
      ignores credentials but the AWS SDK refuses to send requests without them.
    - Table schema MUST exactly match dynamoDB-architecture.md: PK (HASH), SK (RANGE), GSI1
      with GSI1PK (HASH) + GSI1SK (RANGE), ProjectionType ALL, BillingMode PAY_PER_REQUEST.
    - deleteTable MUST swallow ResourceNotFoundException — this is the idempotency guarantee
      for ORCH-05 (re-running after partial failure must not crash teardown).
    - Import from '@aws-sdk/client-dynamodb' (NOT '@aws-sdk/lib-dynamodb').

    Write the following content to apps/e2e/src/db/init.ts:

      import {
        DynamoDBClient,
        CreateTableCommand,
        DeleteTableCommand,
        ResourceNotFoundException,
      } from '@aws-sdk/client-dynamodb';

      export function createTestDynamoDBClient(): DynamoDBClient {
        return new DynamoDBClient({
          region: process.env.AWS_REGION ?? 'us-east-1',
          endpoint: process.env.LOCAL_DYNAMODB_URL ?? 'http://localhost:8000',
          // DynamoDB Local ignores credentials but the SDK requires them to be present
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        });
      }

      export async function createTable(client: DynamoDBClient): Promise<void> {
        const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';

        await client.send(
          new CreateTableCommand({
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
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI1',
                KeySchema: [
                  { AttributeName: 'GSI1PK', KeyType: 'HASH' },
                  { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            BillingMode: 'PAY_PER_REQUEST',
          }),
        );
      }

      export async function deleteTable(client: DynamoDBClient): Promise<void> {
        const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';

        try {
          await client.send(new DeleteTableCommand({ TableName: tableName }));
        } catch (err) {
          // Swallow ResourceNotFoundException — idempotent teardown (ORCH-05)
          if (!(err instanceof ResourceNotFoundException)) {
            throw err;
          }
        }
      }
  </action>
  <verify>
    <automated>test -f apps/e2e/src/db/init.ts && grep -q "createTestDynamoDBClient" apps/e2e/src/db/init.ts && grep -q "createTable" apps/e2e/src/db/init.ts && grep -q "deleteTable" apps/e2e/src/db/init.ts && grep -q "ResourceNotFoundException" apps/e2e/src/db/init.ts && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/src/db/init.ts exists; exports createTestDynamoDBClient, createTable, deleteTable; uses fake credentials for DynamoDB Local; schema has PK/SK primary key plus GSI1 with GSI1PK/GSI1SK; deleteTable swallows ResourceNotFoundException.</done>
</task>

<task type="auto">
  <name>Task 2.2: Create apps/e2e/src/db/seed.ts</name>
  <files>apps/e2e/src/db/seed.ts</files>
  <action>
    Create apps/e2e/src/db/seed.ts with one exported function seedTestData(client) that seeds
    the minimum data needed for Phase 4 smoke tests. Also export the fixed test IDs as constants
    so Phase 4 tests can reference them without hardcoding strings.

    Seed three records per dynamoDB-architecture.md entity layout:
      1. Trip metadata:  PK=TRIP#test-trip-001, SK=META#test-trip-001
      2. Participant:    PK=TRIP#test-trip-001, SK=USER#test-user-001,
                         GSI1PK=USER#test-user-001, GSI1SK=TRIP#test-trip-001
                         (required for dashboard GSI1 query access pattern)
      3. Item:           PK=TRIP#test-trip-001, SK=ITEM#test-item-001

    Use the raw DynamoDB attribute value format {S: '...'}, {N: '...'}, {BOOL: ...} since
    the client is DynamoDBClient (not DocumentClient). Import PutItemCommand from
    '@aws-sdk/client-dynamodb'.

    Write the following content to apps/e2e/src/db/seed.ts:

      import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

      export const TRIP_ID = 'test-trip-001';
      export const USER_ID = 'test-user-001';
      export const ITEM_ID = 'test-item-001';

      export async function seedTestData(client: DynamoDBClient): Promise<void> {
        const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';
        const now = new Date().toISOString();

        // Trip metadata
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              PK: { S: `TRIP#${TRIP_ID}` },
              SK: { S: `META#${TRIP_ID}` },
              TripName: { S: 'Test Trip' },
              CreatedAt: { S: now },
            },
          }),
        );

        // Participant record (populates GSI1 for dashboard access pattern)
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              PK: { S: `TRIP#${TRIP_ID}` },
              SK: { S: `USER#${USER_ID}` },
              GSI1PK: { S: `USER#${USER_ID}` },
              GSI1SK: { S: `TRIP#${TRIP_ID}` },
              TripName: { S: 'Test Trip' },
              AddedAt: { S: now },
            },
          }),
        );

        // Packing item
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              PK: { S: `TRIP#${TRIP_ID}` },
              SK: { S: `ITEM#${ITEM_ID}` },
              Name: { S: 'Test Item' },
              Qty: { N: '1' },
              Weight: { S: '100g' },
              Status: { S: 'to-buy' },
              Consumable: { BOOL: false },
              Category: { S: 'Gear' },
            },
          }),
        );
      }
  </action>
  <verify>
    <automated>test -f apps/e2e/src/db/seed.ts && grep -q "seedTestData" apps/e2e/src/db/seed.ts && grep -q "TRIP_ID" apps/e2e/src/db/seed.ts && grep -q "GSI1PK" apps/e2e/src/db/seed.ts && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/src/db/seed.ts exists; exports seedTestData, TRIP_ID, USER_ID, ITEM_ID; seeds Trip metadata + Participant (with GSI1 keys) + Item using raw DynamoDB attribute value format.</done>
</task>

<task type="auto">
  <name>Task 2.3: Create apps/e2e/src/auth/login.ts</name>
  <files>apps/e2e/src/auth/login.ts</files>
  <action>
    Create apps/e2e/src/auth/login.ts with one exported async function loginAndSaveState(). This
    function opens a headless Chromium browser, navigates to the Vite app, fills the AWS Amplify
    Authenticator login form, waits for the post-login redirect, and saves browser session state
    (localStorage + cookies) to apps/e2e/.auth/user.json as Playwright storageState.

    The directory apps/e2e/src/auth/ must be created if it does not exist.

    CRITICAL constraints (D-07, D-08, D-09, RESEARCH.md §6):
    - AUTH_STATE_PATH must resolve to apps/e2e/.auth/user.json. From apps/e2e/src/auth/,
      that is: join(import.meta.dirname, '..', '..', '.auth', 'user.json')
    - Guard on TEST_USER_EMAIL and TEST_USER_PASSWORD — throw a clear, actionable error if
      either is missing (AUTH-01). The error message must mention .env.example.
    - Create .auth/ directory with mkdirSync({ recursive: true }) before writing storageState
      — the directory may not exist on first run.
    - Wait for [data-amplify-authenticator] selector before filling fields — the Amplify UI
      component can take time to hydrate after page load (RESEARCH.md pitfall).
    - Use semantic role selectors stable across Amplify versions:
        getByRole('textbox', { name: /email/i })
        getByRole('textbox', { name: /password/i })
        getByRole('button', { name: /sign in/i })
    - After clicking Sign In, wait for URL change: waitForURL('**/', { timeout: 30000 })
      — this confirms successful login and redirect to the dashboard.
    - Use try/finally to ensure browser.close() is always called even on error.

    Write the following content to apps/e2e/src/auth/login.ts:

      import { chromium } from '@playwright/test';
      import { mkdirSync } from 'fs';
      import { dirname, join } from 'path';

      const AUTH_STATE_PATH = join(
        import.meta.dirname,
        '..',
        '..',
        '.auth',
        'user.json',
      );

      export async function loginAndSaveState(): Promise<void> {
        const email = process.env.TEST_USER_EMAIL;
        const password = process.env.TEST_USER_PASSWORD;
        const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

        if (!email || !password) {
          throw new Error(
            'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set. ' +
              'Copy apps/e2e/.env.example to apps/e2e/.env.test and fill in the values.',
          );
        }

        // Ensure .auth/ directory exists before writing storageState
        mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });

        const browser = await chromium.launch();
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
          await page.goto(baseURL);

          // Wait for Amplify Authenticator to hydrate before interacting with form fields
          await page.waitForSelector('[data-amplify-authenticator]', {
            timeout: 15_000,
          });

          await page.getByRole('textbox', { name: /email/i }).fill(email);
          await page.getByRole('textbox', { name: /password/i }).fill(password);
          await page.getByRole('button', { name: /sign in/i }).click();

          // Wait for redirect to dashboard — confirms successful Cognito token exchange
          await page.waitForURL('**/', { timeout: 30_000 });

          await context.storageState({ path: AUTH_STATE_PATH });
        } finally {
          await browser.close();
        }
      }
  </action>
  <verify>
    <automated>test -f apps/e2e/src/auth/login.ts && grep -q "loginAndSaveState" apps/e2e/src/auth/login.ts && grep -q "TEST_USER_EMAIL" apps/e2e/src/auth/login.ts && grep -q "data-amplify-authenticator" apps/e2e/src/auth/login.ts && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/src/auth/login.ts exists; exports loginAndSaveState; throws clear error when TEST_USER_EMAIL is missing; waits for Amplify component hydration; saves storageState to .auth/user.json; browser.close() is in finally block.</done>
</task>

</tasks>

---

## Plan 3 of 4 — Wave 2: Global Setup + Teardown

**Wave:** 2 | **Depends on:** Plan 1 (packages installed), Plan 2 (init.ts, seed.ts, login.ts) | **Parallel with:** Plan 4
**Files:** `apps/e2e/global-setup.ts`, `apps/e2e/global-teardown.ts`
**Requirements:** ORCH-01 (DynamoDB Local), ORCH-04 (teardown), ORCH-05 (idempotency),
                  DB-01 (createTable), DB-02 (seedTestData), DB-03 (deleteTable), AUTH-02 (login)

<tasks>

<task type="auto">
  <name>Task 3.1: Create apps/e2e/global-setup.ts</name>
  <files>apps/e2e/global-setup.ts</files>
  <action>
    Create apps/e2e/global-setup.ts as Playwright's global setup hook. Playwright runs this
    once per test suite, AFTER webServer processes are confirmed healthy, BEFORE any test runs.

    CRITICAL ordering fact (RESEARCH.md §2):
    Playwright's execution order is:
      1. Load playwright.config.ts (dotenv runs here, populating process.env)
      2. Start webServer processes (pnpm --filter api dev, pnpm --filter client dev)
      3. Wait for webServer health URLs (http://localhost:3001/health, http://localhost:5173)
      4. Run globalSetup ← this file executes HERE
      5. Run tests
      6. Run globalTeardown
      7. Stop webServer processes

    The API is already listening on port 3001 when globalSetup runs. The API's DynamoDB client
    does NOT make network calls until the first query — the /health endpoint does not touch
    DynamoDB. Starting DynamoDB Local in globalSetup (step 4) is therefore safe.

    Fixed port binding (D-02, RESEARCH.md §2 Part B):
    Use .withExposedPorts({ container: 8000, host: 8000 }) — the object syntax available since
    testcontainers-node v10 forces a specific host port. This ensures host port 8000 is used,
    which matches LOCAL_DYNAMODB_URL=http://localhost:8000 in the API's environment.

    Container state persistence (RESEARCH.md §5):
    Write the container ID to .e2e-state.json so globalTeardown can reference it. Playwright
    may run globalSetup and globalTeardown in separate Node.js processes — global variables do
    not survive across them. Testcontainers v10+ includes the Ryuk reaper which auto-cleans
    containers on process exit regardless.

    Write the following content to apps/e2e/global-setup.ts:

      import { GenericContainer } from 'testcontainers';
      import { writeFileSync } from 'fs';
      import { join } from 'path';
      import type { FullConfig } from '@playwright/test';

      import { createTestDynamoDBClient, createTable } from './src/db/init';
      import { seedTestData } from './src/db/seed';
      import { loginAndSaveState } from './src/auth/login';

      const STATE_FILE = join(import.meta.dirname, '.e2e-state.json');

      export default async function globalSetup(_config: FullConfig): Promise<void> {
        // Step 1: Start DynamoDB Local container on fixed host port 8000 (D-01, D-02)
        // withExposedPorts object syntax { container: N, host: N } forces a specific host port
        const container = await new GenericContainer('amazon/dynamodb-local')
          .withExposedPorts({ container: 8000, host: 8000 })
          .start();

        // Step 2: Persist container ID so globalTeardown can reference it if needed
        // (Ryuk reaper handles actual cleanup on process exit — this is belt-and-suspenders)
        writeFileSync(STATE_FILE, JSON.stringify({ containerId: container.getId() }));

        // Step 3: Create DynamoDB table with production schema (D-11, DB-01)
        const dbClient = createTestDynamoDBClient();
        await createTable(dbClient);

        // Step 4: Seed minimum test data (DB-02)
        await seedTestData(dbClient);

        // Step 5: Browser UI login — Vite is already up (webServer started it before globalSetup)
        // Saves authenticated session to .auth/user.json (D-07, D-08, AUTH-02, AUTH-03)
        await loginAndSaveState();
      }
  </action>
  <verify>
    <automated>test -f apps/e2e/global-setup.ts && grep -q "globalSetup" apps/e2e/global-setup.ts && grep -q "GenericContainer" apps/e2e/global-setup.ts && grep -q "withExposedPorts" apps/e2e/global-setup.ts && grep -q "createTable" apps/e2e/global-setup.ts && grep -q "loginAndSaveState" apps/e2e/global-setup.ts && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/global-setup.ts exists; default export is globalSetup; starts DynamoDB Local with withExposedPorts({container:8000, host:8000}); writes container ID to .e2e-state.json; calls createTable, seedTestData, loginAndSaveState in order; imports from ./src/db/init, ./src/db/seed, ./src/auth/login without .js extensions (Playwright transform handles resolution).</done>
</task>

<task type="auto">
  <name>Task 3.2: Create apps/e2e/global-teardown.ts</name>
  <files>apps/e2e/global-teardown.ts</files>
  <action>
    Create apps/e2e/global-teardown.ts as Playwright's global teardown hook. This runs once
    after all tests complete, before Playwright exits.

    Container cleanup strategy (D-13, RESEARCH.md §5):
    Testcontainers v10+ ships the Ryuk reaper container which automatically stops all
    testcontainers-managed containers when the Node.js process exits. The teardown function
    therefore does NOT need to explicitly call container.stop(). Relying on Ryuk is the
    recommended pattern — it handles cleanup even if teardown crashes.

    What teardown MUST do:
      1. Delete the DynamoDB table so the next pnpm test:e2e run starts with a clean state
         (ORCH-05). deleteTable swallows ResourceNotFoundException, so this is safe even if
         the table was never created (e.g., globalSetup failed early).
      2. Remove .e2e-state.json to clean up after itself.

    Both operations are wrapped in try/catch — teardown must never throw, because a throwing
    teardown masks the actual test failure in the Playwright output.

    Write the following content to apps/e2e/global-teardown.ts:

      import { existsSync, unlinkSync } from 'fs';
      import { join } from 'path';
      import type { FullConfig } from '@playwright/test';

      import { createTestDynamoDBClient, deleteTable } from './src/db/init';

      const STATE_FILE = join(import.meta.dirname, '.e2e-state.json');

      export default async function globalTeardown(_config: FullConfig): Promise<void> {
        // Step 1: Delete the DynamoDB table (DB-03, D-12)
        // deleteTable swallows ResourceNotFoundException — safe even if setup failed mid-way
        try {
          const dbClient = createTestDynamoDBClient();
          await deleteTable(dbClient);
        } catch (err) {
          // Log but do not rethrow — a throwing teardown masks actual test failures
          console.error('[teardown] Failed to delete DynamoDB table:', err);
        }

        // Step 2: Remove container state file
        try {
          if (existsSync(STATE_FILE)) {
            unlinkSync(STATE_FILE);
          }
        } catch {
          // Non-fatal
        }

        // Container cleanup is handled automatically by the Ryuk reaper on process exit (D-13)
      }
  </action>
  <verify>
    <automated>test -f apps/e2e/global-teardown.ts && grep -q "globalTeardown" apps/e2e/global-teardown.ts && grep -q "deleteTable" apps/e2e/global-teardown.ts && grep -q "STATE_FILE" apps/e2e/global-teardown.ts && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/global-teardown.ts exists; default export is globalTeardown; calls deleteTable (idempotent); removes .e2e-state.json; both operations wrapped in try/catch; no explicit container.stop() (Ryuk handles cleanup).</done>
</task>

</tasks>

---

## Plan 4 of 4 — Wave 2: Playwright Config Update + README

**Wave:** 2 | **Depends on:** Plan 1 (dotenv installed, tsconfig expanded) | **Parallel with:** Plan 3
**Files:** `apps/e2e/playwright.config.ts`, `apps/e2e/README.md`
**Requirements:** ORCH-02/03/05 (webServer config), AUTH-03 (storageState), AUTH-04 (README instructions)

<tasks>

<task type="auto">
  <name>Task 4.1: Update apps/e2e/playwright.config.ts</name>
  <files>apps/e2e/playwright.config.ts</files>
  <action>
    Replace the existing apps/e2e/playwright.config.ts (written in Phase 1) with an updated
    version. ALL Phase 1 settings must be preserved: testDir, forbidOnly, retries, workers,
    reporter, outputDir, use.baseURL, use.trace, use.screenshot, and the chromium project.

    Four additions versus Phase 1 (RESEARCH.md §2, §3, §7):

    ADDITION 1 — dotenv load at the very top of the file (BEFORE defineConfig and BEFORE any
    import that reads process.env). This populates process.env (LOCAL_DYNAMODB_URL,
    COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, etc.) before Playwright spawns the webServer
    processes. Uses resolve(import.meta.dirname, '.env.test') to locate .env.test relative
    to playwright.config.ts regardless of where pnpm is invoked from.
    Set override: false so CI-injected env vars take precedence over .env.test values.

    ADDITION 2 — globalSetup and globalTeardown entries pointing to the files created in Plan 3.

    ADDITION 3 — webServer array with two entries:
      Entry A (API): command 'pnpm --filter api dev' (runs tsx watch src/index.ts from apps/api),
        url: 'http://localhost:3001/health', timeout: 30_000, reuseExistingServer: !process.env.CI.
        env MUST spread ...process.env (Playwright does NOT auto-merge webServer.env with
        process.env), then override with test-specific values.
      Entry B (Vite): command 'pnpm --filter client dev',
        url: 'http://localhost:5173', timeout: 60_000, reuseExistingServer: !process.env.CI.
        env MUST include VITE_APP_VERSION — apps/client/src/config.ts calls
        requireEnv('VITE_APP_VERSION') which throws if missing. Default to 'test'.

    ADDITION 4 — use.storageState: '.auth/user.json' — all tests start authenticated.
    Path is relative to playwright.config.ts location (apps/e2e/ directory).

    Write the following complete replacement for apps/e2e/playwright.config.ts:

      import { resolve } from 'path';
      import { config as loadEnv } from 'dotenv';

      // CRITICAL: Load .env.test before defineConfig so process.env is populated when
      // webServer processes are spawned. override:false lets CI environment variables
      // take precedence over .env.test values.
      loadEnv({ path: resolve(import.meta.dirname, '.env.test'), override: false });

      import { defineConfig, devices } from '@playwright/test';

      export default defineConfig({
        testDir: './tests',

        // Fail fast on CI if test.only was accidentally committed
        forbidOnly: !!process.env.CI,

        // Retry failed tests on CI; no retries locally
        retries: process.env.CI ? 2 : 0,

        // Single worker on CI to avoid resource contention; full parallelism locally
        workers: process.env.CI ? 1 : undefined,

        // GitHub Actions annotations on CI; HTML report (opens on failure) locally
        reporter: process.env.CI
          ? 'github'
          : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

        // Artifact output directory (screenshots, traces)
        outputDir: 'test-results',

        // Global setup/teardown hooks (Phase 2)
        globalSetup: './global-setup.ts',
        globalTeardown: './global-teardown.ts',

        // Settings shared across all test projects
        use: {
          // Target the Vite dev server; override with BASE_URL env var (PW-02, PW-03)
          baseURL: process.env.BASE_URL ?? 'http://localhost:5173',

          // Collect trace on first retry; keeps artifact size manageable
          trace: 'on-first-retry',

          // Screenshot only on failure
          screenshot: 'only-on-failure',

          // All tests start authenticated via session saved by globalSetup (D-10, AUTH-03)
          storageState: '.auth/user.json',
        },

        // Chromium only — D-01
        projects: [
          {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
          },
        ],

        // Start API and Vite before tests; Playwright manages process lifecycle (D-03, D-04)
        webServer: [
          {
            // Fastify API — dev script in apps/api/package.json is 'tsx watch src/index.ts'
            command: 'pnpm --filter api dev',
            url: 'http://localhost:3001/health',
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
            env: {
              // Spread process.env first — webServer.env does NOT auto-merge with process.env
              ...process.env,
              NODE_ENV: 'test',
              DYNAMODB_TABLE: process.env.DYNAMODB_TABLE ?? 'packpixie-test',
              LOCAL_DYNAMODB_URL: process.env.LOCAL_DYNAMODB_URL ?? 'http://localhost:8000',
              COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ?? '',
              COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? '',
            },
          },
          {
            // Vite React SPA — dev script in apps/client/package.json is 'vite'
            command: 'pnpm --filter client dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
            env: {
              ...process.env,
              // VITE_APP_VERSION required by apps/client/src/config.ts (requireEnv throws if missing)
              VITE_APP_VERSION: process.env.VITE_APP_VERSION ?? 'test',
              VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:3001',
              VITE_COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ?? '',
              VITE_COGNITO_USER_POOL_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? '',
            },
          },
        ],
      });
  </action>
  <verify>
    <automated>grep -q "globalSetup" apps/e2e/playwright.config.ts && grep -q "globalTeardown" apps/e2e/playwright.config.ts && grep -q "webServer" apps/e2e/playwright.config.ts && grep -q "storageState" apps/e2e/playwright.config.ts && grep -q "loadEnv" apps/e2e/playwright.config.ts && grep -q "pnpm --filter api dev" apps/e2e/playwright.config.ts && grep -q "pnpm --filter client dev" apps/e2e/playwright.config.ts && echo "PASS"</automated>
  </verify>
  <done>playwright.config.ts has dotenv load before defineConfig; globalSetup and globalTeardown wired; webServer array with two entries (API on 3001, Vite on 5173); both webServer.env entries spread ...process.env; use.storageState set to '.auth/user.json'; all Phase 1 settings preserved unchanged.</done>
</task>

<task type="auto">
  <name>Task 4.2: Create apps/e2e/README.md</name>
  <files>apps/e2e/README.md</files>
  <action>
    Create apps/e2e/README.md with local setup instructions. This satisfies AUTH-04 (instructions
    for creating the Cognito test user) and documents all prerequisites and troubleshooting steps.

    The README must include:
      1. Prerequisites (Docker, Node.js, pnpm)
      2. Environment setup (copy .env.example → .env.test, variable reference table)
      3. Cognito test user creation via AWS CLI (admin-create-user + admin-set-user-password)
      4. How to run tests (pnpm test:e2e, what happens automatically)
      5. CI notes (no .env.test needed; GitHub Actions secrets)
      6. Troubleshooting (port 8000 conflict, missing storageState, Cognito login fails)

    Write the following content to apps/e2e/README.md:

      # PackPixie E2E Tests

      End-to-end tests using Playwright + testcontainers. Running `pnpm test:e2e` starts the
      full application stack automatically — no manual pre-steps required beyond the one-time
      setup below.

      ## Prerequisites

      - **Docker** — required for DynamoDB Local, started automatically via testcontainers
      - **Node.js ≥ 20.11** and **pnpm ≥ 10** (standard repo requirements)
      - A deployed PackPixie Cognito User Pool (dev environment pool is fine)

      ## One-Time Setup

      ### 1. Configure environment variables

      ```bash
      cp apps/e2e/.env.example apps/e2e/.env.test
      ```

      Open `apps/e2e/.env.test` and fill in the values from your AWS environment:

      | Variable | Where to find it |
      |---|---|
      | `COGNITO_USER_POOL_ID` | AWS Console → Cognito → User Pools → your pool → Overview |
      | `COGNITO_CLIENT_ID` | AWS Console → Cognito → User Pools → your pool → App clients |
      | `TEST_USER_EMAIL` | Email address of the test user you will create in step 2 |
      | `TEST_USER_PASSWORD` | Permanent password you will set for the test user |

      Leave `DYNAMODB_TABLE`, `LOCAL_DYNAMODB_URL`, `VITE_APP_VERSION`, and `VITE_API_URL`
      at their default values unless you have a specific reason to change them.

      ### 2. Create a Cognito test user

      Run the following AWS CLI commands (replace the placeholder values with yours):

      ```bash
      # Create the user account (initial password is temporary — must be reset)
      aws cognito-idp admin-create-user \
        --user-pool-id YOUR_COGNITO_USER_POOL_ID \
        --username YOUR_TEST_USER_EMAIL \
        --temporary-password TempPass123!

      # Set a permanent password so the account does not require a forced reset on first login
      aws cognito-idp admin-set-user-password \
        --user-pool-id YOUR_COGNITO_USER_POOL_ID \
        --username YOUR_TEST_USER_EMAIL \
        --password YOUR_TEST_USER_PASSWORD \
        --permanent
      ```

      The test user only needs to exist in Cognito. No application-level setup is required.

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

      **Cognito login times out or fails**
      Verify that `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` in `.env.test` match the user
      you created in step 2. The permanent password must have been set with
      `admin-set-user-password --permanent` — a temporary password will fail.
  </action>
  <verify>
    <automated>test -f apps/e2e/README.md && grep -q "admin-create-user" apps/e2e/README.md && grep -q "admin-set-user-password" apps/e2e/README.md && grep -q "lsof" apps/e2e/README.md && echo "PASS"</automated>
  </verify>
  <done>apps/e2e/README.md exists; contains Cognito test user creation (admin-create-user + admin-set-user-password --permanent); env var reference table; troubleshooting for port 8000 conflict and missing storageState; CI secrets documentation.</done>
</task>

</tasks>

---

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test runner → DynamoDB Local | Localhost only; fake credentials required by SDK, ignored by DynamoDB Local |
| Test runner → .env.test file | Local filesystem; contains real Cognito credentials and test passwords |
| Playwright browser → Cognito | External TLS-authenticated HTTPS call; real credentials used |
| Playwright browser → Vite dev server | Localhost; session tokens saved to .auth/user.json |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-02-01 | Information Disclosure | .env.test / TEST_USER_PASSWORD | high | mitigate | .env.test added to .gitignore (Task 1.4); never echoed in logs; .env.example has blank values committed instead |
| T-02-02 | Information Disclosure | .auth/user.json (Cognito session tokens) | high | mitigate | .auth/ added to .gitignore (Task 1.4); directory never committed; created fresh per run |
| T-02-03 | Tampering | DynamoDB Local fake credentials in init.ts | low | accept | Credentials are meaningless to DynamoDB Local (it ignores them); endpoint is localhost-only and never reachable outside the dev machine |
| T-02-04 | Information Disclosure | .e2e-state.json (container ID) | low | mitigate | Added to .gitignore (Task 1.4); contains no secrets, only a Docker container ID |
| T-02-05 | Denial of Service | testcontainers leaves orphan container on crash | medium | mitigate | Ryuk reaper auto-cleans containers on process exit (testcontainers v10+); STATE_FILE written to enable explicit cleanup in teardown |
| T-02-06 | Spoofing | TEST_USER_PASSWORD used in browser UI login | medium | mitigate | Password only flows through HTTPS to Cognito; never logged; .env.test gitignored; test user has no production data access |
| T-02-SC | Tampering | npm installs for testcontainers@12.0.2, dotenv@17.3.1 | high | mitigate | Exact version pins (no ^ for testcontainers, dotenv); versions verified against pnpm minimumReleaseAge constraint; checksums locked in pnpm-lock.yaml |
</threat_model>

---

<source_coverage_audit>
## Multi-Source Coverage Audit

### GOAL (ROADMAP Phase 2)
| Item | Status | Plan |
|------|--------|------|
| DynamoDB Local starts before tests | COVERED | Plan 3, Task 3.1 (global-setup.ts) |
| DynamoDB table created | COVERED | Plan 3, Task 3.1 (createTable call) |
| Data seeded | COVERED | Plan 3, Task 3.1 (seedTestData call) |
| API starts via webServer config | COVERED | Plan 4, Task 4.1 (webServer API entry) |
| Vite starts via webServer config | COVERED | Plan 4, Task 4.1 (webServer Vite entry) |
| Browser UI login saves storageState | COVERED | Plan 2, Task 2.3 + Plan 3, Task 3.1 |
| Teardown cleans up | COVERED | Plan 3, Task 3.2 (global-teardown.ts) |
| pnpm test:e2e starts full stack | COVERED | Plan 4, Task 4.1 (webServer + globalSetup) |

### REQ (REQUIREMENTS.md ORCH-01–05, DB-01–04, AUTH-01–04)
| Requirement | Status | Plan |
|-------------|--------|------|
| ORCH-01: global setup starts DynamoDB Local (Docker) | COVERED | Plan 3, Task 3.1 |
| ORCH-02: API starts in test mode before tests | COVERED | Plan 4, Task 4.1 (webServer API) |
| ORCH-03: Vite client starts before tests | COVERED | Plan 4, Task 4.1 (webServer Vite) |
| ORCH-04: global teardown stops all processes cleanly | COVERED | Plan 3, Task 3.2 + D-14 (webServer auto-kill) |
| ORCH-05: setup/teardown idempotent | COVERED | Plan 2 Task 2.1 (deleteTable swallows RNFE) + Plan 4 (reuseExistingServer) |
| DB-01: creates table with correct schema and GSI | COVERED | Plan 2, Task 2.1 (init.ts createTable) |
| DB-02: seeds minimum test data | COVERED | Plan 2, Task 2.2 (seed.ts seedTestData) |
| DB-03: teardown deletes table | COVERED | Plan 3, Task 3.2 (globalTeardown calls deleteTable) |
| DB-04: driven by DYNAMODB_TABLE and LOCAL_DYNAMODB_URL env vars | COVERED | Plan 1 Task 1.3 (.env.example) + Plan 2 Task 2.1 (env var reads) |
| AUTH-01: credentials from TEST_USER_EMAIL, TEST_USER_PASSWORD | COVERED | Plan 2, Task 2.3 (guard in loginAndSaveState) |
| AUTH-02: auth helper logs in Cognito user and saves storageState | COVERED | Plan 2, Task 2.3 (login.ts) |
| AUTH-03: tests reuse saved auth session | COVERED | Plan 4, Task 4.1 (use.storageState) |
| AUTH-04: instructions for creating Cognito test user | COVERED | Plan 4, Task 4.2 (README.md) |

### RESEARCH (RESEARCH.md key findings)
| Finding | Status | Plan |
|---------|--------|------|
| testcontainers@12.0.2 exact pin | COVERED | Plan 1, Task 1.1 |
| Fixed port 8000 via withExposedPorts object syntax | COVERED | Plan 3, Task 3.1 |
| dotenv load before defineConfig in playwright.config.ts | COVERED | Plan 4, Task 4.1 |
| webServer.env must spread ...process.env | COVERED | Plan 4, Task 4.1 |
| DynamoDB Local fake credentials | COVERED | Plan 2, Task 2.1 |
| VITE_APP_VERSION required by client/src/config.ts | COVERED | Plan 4, Task 4.1 |
| Amplify [data-amplify-authenticator] wait before form fill | COVERED | Plan 2, Task 2.3 |
| Ryuk reaper handles container cleanup | COVERED | Plan 3, Task 3.2 |
| .e2e-state.json for cross-process container ID | COVERED | Plan 3, Task 3.1 |

### CONTEXT (CONTEXT.md D-01–D-14)
| Decision | Status | Plan |
|----------|--------|------|
| D-01: testcontainers-node, amazon/dynamodb-local image | COVERED | Plan 1 + Plan 3, Task 3.1 |
| D-02: container started in global-setup.ts, port 8000 | COVERED | Plan 3, Task 3.1 |
| D-03: Playwright webServer array config | COVERED | Plan 4, Task 4.1 |
| D-04: both API and Vite started | COVERED | Plan 4, Task 4.1 |
| D-05: API webServer — health http://localhost:3001/health | COVERED | Plan 4, Task 4.1 |
| D-06: Vite webServer — health http://localhost:5173, VITE_* env vars | COVERED | Plan 4, Task 4.1 |
| D-07: browser UI login through Amplify Authenticator | COVERED | Plan 2, Task 2.3 |
| D-08: storageState to .auth/user.json | COVERED | Plan 2, Task 2.3 |
| D-09: credentials from env vars, abort with clear error if missing | COVERED | Plan 2, Task 2.3 |
| D-10: auth runs once in global-setup; tests reuse via storageState | COVERED | Plan 4, Task 4.1 |
| D-11: table schema PK/SK + GSI1, BillingMode PAY_PER_REQUEST | COVERED | Plan 2, Task 2.1 |
| D-12: teardown deletes table | COVERED | Plan 3, Task 3.2 |
| D-13: teardown calls container.stop(); Ryuk also cleans up | COVERED | Plan 3, Task 3.2 |
| D-14: webServer processes killed by Playwright automatically | COVERED | Plan 4, Task 4.1 (no manual teardown needed) |

Deferred ideas excluded from coverage: Docker Compose, direct Cognito API auth,
per-test DB isolation, multi-user seeding.

**Coverage result: ALL items COVERED. No gaps.**
</source_coverage_audit>

---

<verification>
## Phase Verification

After all 4 plans execute, verify the full phase end-to-end:

1. Create apps/e2e/.env.test from .env.example and populate Cognito + test user values.

2. Run the full stack:
   pnpm test:e2e
   Expected: DynamoDB Local container starts → table created → data seeded → API on 3001 →
   Vite on 5173 → Cognito login succeeds → .auth/user.json written → "0 passed" (no tests yet)
   → teardown: table deleted → container stopped by Ryuk.

3. Verify idempotency (ORCH-05):
   Run pnpm test:e2e a second time immediately. Must succeed — no "table already exists" or
   "container port in use" errors.

4. Verify missing env var guard (AUTH-01):
   Temporarily unset TEST_USER_EMAIL in .env.test, run pnpm test:e2e. Must produce:
   "Error: TEST_USER_EMAIL and TEST_USER_PASSWORD must be set. Copy apps/e2e/.env.example..."
   Restore .env.test afterward.

5. Verify storageState:
   After a successful run, check that apps/e2e/.auth/user.json exists and is valid JSON with
   cookies/localStorage content.
</verification>

<success_criteria>
- [ ] apps/e2e/package.json has testcontainers@12.0.2 (exact), dotenv@17.3.1 (exact), @aws-sdk/client-dynamodb@^3.962.0
- [ ] pnpm install succeeds; apps/e2e/node_modules/testcontainers exists
- [ ] apps/e2e/tsconfig.json include covers global-setup.ts, global-teardown.ts, src/**/*
- [ ] apps/e2e/.env.example documents all 10 required env vars with correct defaults
- [ ] apps/e2e/.gitignore includes .auth/, .env.test, .e2e-state.json
- [ ] apps/e2e/src/db/init.ts exports createTestDynamoDBClient, createTable, deleteTable
- [ ] createTable uses PK/SK primary key + GSI1 (GSI1PK/GSI1SK) + PAY_PER_REQUEST
- [ ] deleteTable swallows ResourceNotFoundException
- [ ] apps/e2e/src/db/seed.ts exports seedTestData, TRIP_ID, USER_ID, ITEM_ID
- [ ] apps/e2e/src/auth/login.ts exports loginAndSaveState; throws clear error on missing TEST_USER_EMAIL
- [ ] apps/e2e/global-setup.ts starts DynamoDB Local with fixed port 8000; calls createTable, seedTestData, loginAndSaveState
- [ ] apps/e2e/global-teardown.ts calls deleteTable; removes .e2e-state.json; no explicit container.stop()
- [ ] apps/e2e/playwright.config.ts: dotenv load at top, globalSetup/Teardown, webServer array (2 entries), use.storageState, ...process.env spread in both webServer.env
- [ ] apps/e2e/README.md: admin-create-user + admin-set-user-password --permanent commands; port 8000 troubleshooting
- [ ] pnpm test:e2e starts full stack and exits cleanly with "0 passed" (Phase 2 complete; tests added in Phase 4)
- [ ] pnpm test:e2e run twice in a row — second run does not fail (ORCH-05 idempotency)
</success_criteria>

<output>
When all 4 plans are complete, create:
  .planning/phases/02-stack-orchestration-db-initialization/02-SUMMARY.md

Use the template at @.github/gsd-core/templates/summary.md. Record:
  - What was delivered (all 10 files)
  - UAT verification results
  - Requirements covered: ORCH-01–05, DB-01–04, AUTH-01–04
  - Key decisions applied: D-01 through D-14
  - Critical detail for Phase 3: testcontainers@12.0.2 exact pin; webServer reuseExistingServer
    is false on CI; DynamoDB Local on port 8000 (must match CI service container port)
</output>
