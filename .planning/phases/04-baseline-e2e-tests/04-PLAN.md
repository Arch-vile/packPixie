---
phase: 04-baseline-e2e-tests
plan: "01-04"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/e2e/src/db/seed.ts
  - apps/e2e/global-setup.ts
  - apps/client/src/App.tsx
  - apps/client/src/TripList.tsx
  - apps/e2e/src/fixtures/index.ts
  - apps/e2e/tests/auth.spec.ts
  - apps/e2e/tests/trip.spec.ts
autonomous: true
requirements:
  - TEST-01
  - TEST-02
  - TEST-03
must_haves:
  truths:
    - pnpm e2e exits 0 — both auth.spec.ts and trip.spec.ts pass
    - global-setup.ts contains zero references to the seed module
    - apps/e2e/src/db/seed.ts has been deleted from the repository
    - App.tsx signed-in paragraph carries data-testid="signed-in-label"
    - TripList.tsx trip-name span carries data-testid="trip-name"
    - trip.spec.ts wraps the Create button click in Promise.all + waitForResponse
  artifacts:
    - apps/e2e/tests/auth.spec.ts
    - apps/e2e/tests/trip.spec.ts
    - apps/e2e/src/fixtures/index.ts
  key_links:
    - auth.spec.ts + trip.spec.ts import { test, expect } from src/fixtures/index.ts
    - getByTestId('signed-in-label') resolves to data-testid attr on p.signed-in-label in App.tsx
    - getByTestId('trip-name') resolves to data-testid attr on span.trip-name in TripList.tsx
    - waitForResponse POST /api/trips -> Fastify createTrip handler -> DynamoDB Local
---

<objective>
Add two baseline E2E test files (auth smoke + trip creation happy path) and the prerequisite
changes that make their selectors reliable: remove seeded test data, delete seed.ts, and add
two data-testid attributes to client components.

Purpose: TEST-01–03 require at least two passing E2E specs exercising the full application
stack through a real Chromium browser. This plan delivers the minimum meaningful suite on top
of the Phase 1–3 infrastructure without touching the wired global-setup/teardown or Playwright
config.

Output:
- apps/e2e/global-setup.ts — seed import and invocation removed (per user locked decision D-01)
- apps/e2e/src/db/seed.ts — deleted entirely (per user locked decision D-01)
- apps/client/src/App.tsx — data-testid="signed-in-label" added to signed-in paragraph
- apps/client/src/TripList.tsx — data-testid="trip-name" added to trip name span
- apps/e2e/src/fixtures/index.ts — thin test.extend({}) re-export for import stability
- apps/e2e/tests/auth.spec.ts — smoke test: app loads, signed-in label is visible (TEST-01)
- apps/e2e/tests/trip.spec.ts — happy path: create trip via UI, verify in list (TEST-02, TEST-03)
</objective>

<execution_context>
@.github/gsd-core/workflows/execute-plan.md
@.github/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@apps/e2e/playwright.config.ts
@apps/e2e/global-setup.ts
@apps/e2e/src/config.ts
@apps/client/src/App.tsx
@apps/client/src/TripList.tsx
</context>

<tasks>

<!-- ═══════════════════════════ WAVE 1 ═══════════════════════════════════════════ -->
<!-- Tasks 1 and 2 touch disjoint files — execute concurrently.                    -->
<!-- Wave 2 tasks depend on Wave 1 completing (selectors must exist before tests). -->

<task type="auto">
  <name>Task 1 (Wave 1): Remove seeded data</name>
  <files>apps/e2e/src/db/seed.ts, apps/e2e/global-setup.ts</files>
  <action>
Delete apps/e2e/src/db/seed.ts entirely. The file is no longer referenced after this task.

Edit apps/e2e/global-setup.ts to remove the seed import line and the seed invocation block.
Currently the file has:
  - Line 5: an import of the seedTestData function from ./src/db/seed
  - Lines 22–23: a comment marking "Step 3: Seed minimum test data" and the awaited call

Remove both the import line and the two-line seed block (comment + call). After removal,
renumber the login step comment from "Step 4" to "Step 3" so the numbering is sequential.

The resulting global-setup.ts must contain exactly these imports and steps (no extra blank
lines between import groups, no seed-related identifiers anywhere in the file):

  import { GenericContainer } from 'testcontainers';
  import type { FullConfig } from '@playwright/test';

  import { createTestDynamoDBClient, createTable } from './src/db/init';
  import { loginAndSaveState } from './src/auth/login';

  export default async function globalSetup(_config: FullConfig): Promise<void> {
    // Step 1: Start DynamoDB Local container on fixed host port 8000
    // Ryuk reaper handles container cleanup automatically on process exit
    const container = await new GenericContainer('amazon/dynamodb-local')
      .withExposedPorts({ container: 8000, host: 8000 })
      .start();

    void container; // container lifecycle managed by Ryuk

    // Step 2: Create DynamoDB table with production schema
    const dbClient = createTestDynamoDBClient();
    await createTable(dbClient);

    // Step 3: Browser UI login — saves session to .auth/user.json
    await loginAndSaveState();
  }

global-teardown.ts: no changes needed.
  </action>
  <verify>
    <automated>
test ! -f apps/e2e/src/db/seed.ts && ! grep -q seedTestData apps/e2e/global-setup.ts && echo "OK"
    </automated>
  </verify>
  <done>seed.ts does not exist; global-setup.ts contains no import or invocation of the seed module.</done>
</task>

<task type="auto">
  <name>Task 2 (Wave 1): Add data-testid attributes to client components</name>
  <files>apps/client/src/App.tsx, apps/client/src/TripList.tsx</files>
  <action>
In apps/client/src/App.tsx, locate the signed-in paragraph in the AppContent return block
(currently around line 53):

  Before: &lt;p className="signed-in-label"&gt;Signed in as {userEmail}&lt;/p&gt;
  After:  &lt;p className="signed-in-label" data-testid="signed-in-label"&gt;Signed in as {userEmail}&lt;/p&gt;

Add data-testid="signed-in-label" as an attribute after className. No other changes to App.tsx.

In apps/client/src/TripList.tsx, locate the trip name span inside the trips.map render block
(currently around line 152 in the ul.trip-items section):

  Before: &lt;span className="trip-name"&gt;{trip.tripName}&lt;/span&gt;
  After:  &lt;span className="trip-name" data-testid="trip-name"&gt;{trip.tripName}&lt;/span&gt;

Add data-testid="trip-name" as an attribute after className. No other changes to TripList.tsx.
Do not add data-testid to any other element in either file.
  </action>
  <verify>
    <automated>
[ "$(grep -c 'data-testid="signed-in-label"' apps/client/src/App.tsx)" -eq 1 ] && [ "$(grep -c 'data-testid="trip-name"' apps/client/src/TripList.tsx)" -eq 1 ] && echo "OK"
    </automated>
  </verify>
  <done>
App.tsx has exactly one data-testid="signed-in-label" attribute; TripList.tsx has exactly one
data-testid="trip-name" attribute; grep count returns 1 for each.
  </done>
</task>

<!-- ═══════════════════════════ WAVE 2 ═══════════════════════════════════════════ -->
<!-- Task 3 must complete before Tasks 4 and 5 (both import from fixtures/index).  -->
<!-- Tasks 4 and 5 touch disjoint files — execute concurrently after Task 3.       -->

<task type="auto">
  <name>Task 3 (Wave 2a): Create src/fixtures/index.ts</name>
  <files>apps/e2e/src/fixtures/index.ts</files>
  <action>
Create apps/e2e/src/fixtures/index.ts with the following exact content:

  import { test as base, expect } from '@playwright/test';

  export const test = base.extend({});
  export { expect };

This is a minimal fixture re-export. It adds no custom fixtures in Phase 4. Its purpose is
to establish the canonical import path (../src/fixtures/index) so that future phases can
add fixtures (authenticated page context, API clients, etc.) without modifying every test
file's import statement. All test files import from this path — never directly from
@playwright/test.

mkdir -p apps/e2e/src/fixtures before writing the file if the directory does not exist.
  </action>
  <verify>
    <automated>test -f apps/e2e/src/fixtures/index.ts && grep -q 'base.extend' apps/e2e/src/fixtures/index.ts && echo "OK"</automated>
  </verify>
  <done>apps/e2e/src/fixtures/index.ts exists and exports a test value constructed via base.extend({}) and a re-exported expect.</done>
</task>

<task type="auto">
  <name>Task 4 (Wave 2b): Create tests/auth.spec.ts</name>
  <files>apps/e2e/tests/auth.spec.ts</files>
  <action>
Create apps/e2e/tests/auth.spec.ts with the following exact content:

  import { test, expect } from '../src/fixtures/index';
  import { config } from '../src/config';

  test('authenticated user sees signed-in label', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signed-in-label')).toBeVisible();
    await expect(page.getByTestId('signed-in-label')).toContainText(
      config.auth.testUserEmail,
    );
  });

Implementation notes:
- The test relies on playwright.config.ts use.storageState ('.auth/user.json') to start
  already authenticated. No explicit login steps are needed in the test body.
- config.auth.testUserEmail resolves to the TEST_USER_EMAIL env var. The env var is
  populated before test modules load because playwright.config.ts calls dotenv at the
  top of the file (before the defineConfig import).
- The two assertions are sequential awaits, not chained — this matches Playwright's
  recommended style for independent assertions.
  </action>
  <verify>
    <automated>test -f apps/e2e/tests/auth.spec.ts && grep -q 'getByTestId' apps/e2e/tests/auth.spec.ts && echo "OK"</automated>
  </verify>
  <done>apps/e2e/tests/auth.spec.ts exists, imports from src/fixtures/index, and contains one test with two getByTestId assertions on the signed-in label.</done>
</task>

<task type="auto">
  <name>Task 5 (Wave 2b): Create tests/trip.spec.ts</name>
  <files>apps/e2e/tests/trip.spec.ts</files>
  <action>
Create apps/e2e/tests/trip.spec.ts with the following exact content:

  import { test, expect } from '../src/fixtures/index';

  test('user can create a trip and see it in the list', async ({ page }) => {
    await page.goto('/');

    // Wait for app to be ready — storageState is loaded but the React tree must hydrate
    await expect(page.getByTestId('signed-in-label')).toBeVisible();

    const tripName = `E2E Trip ${Date.now()}`;

    await page.getByRole('button', { name: '+ New Trip' }).click();
    await page.getByPlaceholder('Trip name').fill(tripName);

    // Register the waitForResponse listener BEFORE clicking Create. Playwright's event
    // model requires the listener to be active when the request fires. Promise.all
    // ensures both the listener registration and the click happen atomically.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/trips') &&
          r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Create' }).click(),
    ]);

    // After the POST resolves, TripList calls getTrips() before updating state.
    // Playwright's built-in auto-waiting in toBeVisible() covers the GET round-trip.
    await expect(
      page.getByTestId('trip-name').filter({ hasText: tripName }),
    ).toBeVisible();
  });

Implementation notes:
- Date.now() produces a unique trip name per run, preventing false positives from prior
  runs that left data in DynamoDB Local.
- The Create button renders "Create" in idle state and "Creating…" while in-flight.
  getByRole('button', { name: 'Create' }) matches the idle label before the click.
- The scope of the test is create trip -> verify in list (per user locked decision D-02).
  No item addition flow is included — that API does not exist in Phase 4.
  </action>
  <verify>
    <automated>test -f apps/e2e/tests/trip.spec.ts && grep -q 'waitForResponse' apps/e2e/tests/trip.spec.ts && echo "OK"</automated>
  </verify>
  <done>apps/e2e/tests/trip.spec.ts exists, uses Promise.all + waitForResponse before the Create click, and asserts getByTestId('trip-name').filter({ hasText: tripName }) is visible.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Playwright test process -> DynamoDB Local | SDK writes at localhost:8000; no auth, local-only |
| Playwright browser -> Vite dev server | UI interactions at localhost:5173 |
| Playwright browser -> Fastify API | Trip creation POSTs to localhost:3001; JWT from storageState |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-04-01 | Information Disclosure | test credentials in .env.test | medium | mitigate | .env.test is gitignored; CI injects values from GitHub Actions secrets only |
| T-04-02 | Tampering | DynamoDB Local (no auth) | low | accept | Localhost only; no inbound network exposure; container torn down after every run |
| T-04-03 | Information Disclosure | .auth/user.json Cognito tokens | low | accept | .auth/ is gitignored; tokens are short-lived (~1h TTL); regenerated on every run by globalTeardown |
</threat_model>

<verification>
Run the full E2E suite with a configured .env.test (Docker must be running):

  cd apps/e2e && pnpm e2e

Expected outcome:
- globalSetup starts DynamoDB Local, creates table (no seed step), saves Cognito session
- 2 tests pass: 1 in auth.spec.ts, 1 in trip.spec.ts
- globalTeardown deletes the DynamoDB table and removes .auth/user.json
- Exit code: 0

Static verification (no running stack required):
  test ! -f apps/e2e/src/db/seed.ts
  ! grep -q seedTestData apps/e2e/global-setup.ts
  [ "$(grep -c 'data-testid="signed-in-label"' apps/client/src/App.tsx)" -eq 1 ]
  [ "$(grep -c 'data-testid="trip-name"' apps/client/src/TripList.tsx)" -eq 1 ]
  test -f apps/e2e/src/fixtures/index.ts
  test -f apps/e2e/tests/auth.spec.ts
  test -f apps/e2e/tests/trip.spec.ts
</verification>

<success_criteria>
- pnpm e2e exits 0 with exactly 2 tests passing
- Both tests pass in CI (GitHub Actions e2e.yml) without code changes between environments
- global-setup.ts contains no reference to the seed module
- seed.ts does not exist in the repository
- App.tsx and TripList.tsx each carry exactly one new data-testid attribute
- trip.spec.ts uses Promise.all + waitForResponse — no bare click-then-assert pattern
</success_criteria>

<output>
Create .planning/phases/04-baseline-e2e-tests/04-SUMMARY.md when all tasks are complete.
</output>
