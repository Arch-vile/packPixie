# Phase 4: Baseline E2E Tests — Research

**Researched:** 2026-06-30
**Domain:** Playwright E2E tests, React UI selectors, Playwright fixtures
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from user prompt — locked decisions)

### Locked Decisions
1. **Remove all seeded data** — `seedTestData()` import and call removed from `global-setup.ts`; `apps/e2e/src/db/seed.ts` deleted entirely. No seeding in Phase 4.
2. **Narrow trip.spec.ts scope** — create trip via UI → verify in list. No item addition flow (no item API exists yet).

### the agent's Discretion
- Selector strategy: data-testid vs class/text selectors
- Fixture file: whether to create `src/fixtures/index.ts`
- Network wait approach after trip creation

### Deferred Ideas (OUT OF SCOPE)
- Packing item addition flow (no item API exists)
- Multi-user scenarios
- Error path tests
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | At least one smoke test verifies the app loads and the user can log in | auth.spec.ts — asserts `signed-in-label` is visible after loading with pre-saved storageState |
| TEST-02 | At least one test covers the core happy path: create a trip → verify it appears | trip.spec.ts — clicks "+ New Trip", fills form, submits, asserts `.trip-name` visible (item flow deferred per user decision) |
| TEST-03 | Tests pass in both local and CI environments without code changes | Covered by global `storageState` in playwright.config.ts; env-driven base URL |
</phase_requirements>

---

## Summary

Phase 4 adds two test files and optionally one fixture re-export file to `apps/e2e`. The E2E infrastructure (Docker, DynamoDB Local, Cognito auth, webServers) is already fully wired in Phases 1–3. The primary work in this phase is:

1. **Trimming global-setup.ts** — removing the seed import and call (one locked decision). The DynamoDB table creation (`createTable`) and the browser login (`loginAndSaveState`) remain unchanged.
2. **Deleting seed.ts** — the file is no longer referenced after the above removal.
3. **Writing auth.spec.ts** — loads the app with pre-saved auth state, asserts the signed-in label.
4. **Writing trip.spec.ts** — clicks "+ New Trip", fills trip name input, submits, asserts the trip name appears in the list.
5. **Optionally creating `src/fixtures/index.ts`** — a minimal `test.extend({})` re-export that standardizes imports without adding overhead.

All selectors are derived from direct source-code inspection of `TripList.tsx` and `App.tsx` — no guessing required. No `data-testid` attributes currently exist; see the Selector Strategy section for the recommended approach.

**Primary recommendation:** Use Playwright's semantic selectors (`getByRole`, `getByPlaceholder`, `getByText`) for interactive elements; add exactly two `data-testid` attributes to non-semantic display elements that tests must assert on (`.signed-in-label` and `.trip-name` span). This is a minimal two-line change to client source and produces stable, intent-clear assertions.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auth smoke test | Browser (Playwright) | — | Asserts client-rendered DOM after storageState loaded; no API call needed |
| Trip creation flow | Browser (Playwright) | API (Fastify POST /api/trips) | UI drives creation; API must respond 201 for state to update |
| Selector targeting | Browser DOM | — | CSS classes / ARIA roles / data-testid live in the React client |
| Fixture re-export | Test infra | — | Playwright fixture system; zero runtime overhead |
| global-setup cleanup | Test infra | DynamoDB Local | seed.ts removal; table creation still runs |

---

## Standard Stack

All packages are already installed. No new dependencies are needed for Phase 4.

### Existing (from `apps/e2e/package.json`)
| Library | Version | Purpose |
|---------|---------|---------|
| `@playwright/test` | 1.60.0 | Test runner, assertions, fixtures, page interactions |
| `testcontainers` | 12.0.2 | DynamoDB Local container (already wired in global-setup.ts) |
| `dotenv` | 17.3.1 | `.env.test` loading (already wired in playwright.config.ts) |
| `@aws-sdk/client-dynamodb` | ^3.962.0 | DB init/teardown (no changes) |

**No new packages needed for Phase 4.** [VERIFIED: apps/e2e/package.json]

---

## Package Legitimacy Audit

Not applicable — no new packages are installed in this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
[playwright.config.ts]
        │
        ├── globalSetup → startContainer → createTable → loginAndSaveState → .auth/user.json
        │   (seed step REMOVED)
        │
        ├── use.storageState = '.auth/user.json'   ← all tests start authenticated
        │
        ├── tests/auth.spec.ts
        │       └── page.goto('/') → assert .signed-in-label visible
        │
        └── tests/trip.spec.ts
                └── click '+ New Trip'
                    → fill 'Trip name' input
                    → click 'Create' button
                    → wait for POST /api/trips response
                    → assert .trip-name[hasText=tripName] visible
                         ↓
                    [Fastify API → DynamoDB Local → GET /api/trips response]
```

### Recommended Project Structure

```
apps/e2e/
├── global-setup.ts          ← modify: remove seed import + call
├── global-teardown.ts       ← no changes
├── src/
│   ├── auth/
│   │   └── login.ts         ← no changes
│   ├── config.ts            ← no changes
│   ├── db/
│   │   ├── init.ts          ← no changes
│   │   └── seed.ts          ← DELETE entirely
│   └── fixtures/
│       └── index.ts         ← CREATE (optional; recommended)
└── tests/
    ├── auth.spec.ts         ← CREATE
    └── trip.spec.ts         ← CREATE
```

---

## Exact Changes: global-setup.ts

**Current state** (from source inspection):

```typescript
import { GenericContainer } from 'testcontainers';
import type { FullConfig } from '@playwright/test';

import { createTestDynamoDBClient, createTable } from './src/db/init';
import { seedTestData } from './src/db/seed';           // ← REMOVE THIS LINE
import { loginAndSaveState } from './src/auth/login';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Step 1: Start DynamoDB Local container on fixed host port 8000
  const container = await new GenericContainer('amazon/dynamodb-local')
    .withExposedPorts({ container: 8000, host: 8000 })
    .start();

  void container;

  // Step 2: Create DynamoDB table with production schema
  const dbClient = createTestDynamoDBClient();
  await createTable(dbClient);

  // Step 3: Seed minimum test data                     // ← REMOVE THIS LINE
  await seedTestData(dbClient);                        // ← REMOVE THIS LINE

  // Step 4: Browser UI login — saves session to .auth/user.json
  await loginAndSaveState();
}
```

**After change** — result:

```typescript
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
```

**Changes:**
- Remove line: `import { seedTestData } from './src/db/seed';`
- Remove comment: `// Step 3: Seed minimum test data`
- Remove call: `await seedTestData(dbClient);`
- Renumber the old Step 4 comment to Step 3

---

## Exact Changes: global-teardown.ts

**No changes required.** [VERIFIED: source inspection]

`global-teardown.ts` imports only from `./src/db/init` — it has no reference to `seed.ts`. The teardown is already safe to run with no seed data: `deleteTable` swallows `ResourceNotFoundException`.

---

## seed.ts Disposition

**Delete `apps/e2e/src/db/seed.ts` entirely.** [LOCKED USER DECISION]

No other file imports from `./src/db/seed` or `../db/seed` except `global-setup.ts`. After removing the import from global-setup.ts, seed.ts has zero consumers and must be deleted.

Verify before deletion:
```bash
grep -r "seed" apps/e2e/src/ apps/e2e/global-*.ts
# Expected: only global-setup.ts (which will be modified first)
```

---

## TripList.tsx Selectors (Verified from Source)

All selectors below are derived from direct inspection of `apps/client/src/TripList.tsx`. [VERIFIED: source inspection]

### Interactive elements (semantic selectors — stable)

| Action | Source element | Playwright selector |
|--------|---------------|---------------------|
| Open the create form | `<button className="btn-primary">+ New Trip</button>` | `page.getByRole('button', { name: '+ New Trip' })` |
| Fill trip name | `<input type="text" placeholder="Trip name" />` | `page.getByPlaceholder('Trip name')` |
| Submit the form | `<button type="submit" className="btn-primary">Create</button>` | `page.getByRole('button', { name: 'Create' })` |
| Cancel | `<button type="button" className="btn-secondary">Cancel</button>` | `page.getByRole('button', { name: 'Cancel' })` |

### Display elements (non-semantic — require data-testid or class selector)

| Assertion | Source element | Class selector | Recommended data-testid |
|-----------|---------------|----------------|--------------------------|
| Trip appears in list | `<span className="trip-name">{trip.tripName}</span>` | `page.locator('.trip-name').filter({ hasText: name })` | `data-testid="trip-name"` |
| Empty state | `<p className="empty-state">No trips yet...</p>` | `page.locator('.empty-state')` | not needed (text is stable) |

### App.tsx display elements

| Assertion | Source element | Selector |
|-----------|---------------|----------|
| User is signed in | `<p className="signed-in-label">Signed in as {userEmail}</p>` | `page.locator('.signed-in-label')` |

---

## Selector Strategy (Recommendation)

### Current state
No `data-testid` attributes exist anywhere in `apps/client/src/`. [VERIFIED: source inspection]

### Options

| Strategy | Stability | Client changes | Playwright guidance |
|----------|-----------|----------------|---------------------|
| `data-testid` on all key elements | Highest — survives text/style refactors | Minimal (add attributes) | Recommended in Playwright docs [ASSUMED] |
| Semantic selectors (`getByRole`, `getByPlaceholder`) | High — tied to ARIA semantics | None | Best practice for interactive elements [ASSUMED] |
| Class selectors (`.trip-name`, `.signed-in-label`) | Medium — breaks on CSS renames | None | Acceptable for stable class names |
| Text selectors (`getByText`) | Low — breaks on copy changes | None | Avoid for dynamic content |

### Recommendation: Hybrid approach (minimal footprint)

**For interactive elements** (buttons, inputs): Use Playwright semantic selectors — they're already tied to the DOM semantics and don't require any client changes.

**For non-semantic display elements** that tests MUST assert on: Add exactly **two `data-testid` attributes** to client source:
1. `apps/client/src/App.tsx`: `<p className="signed-in-label" data-testid="signed-in-label">Signed in as {userEmail}</p>`
2. `apps/client/src/TripList.tsx`: `<span className="trip-name" data-testid="trip-name">{trip.tripName}</span>`

**Why only two?** Phase 4 tests assert only two non-semantic elements. Adding `data-testid` only where needed keeps the diff minimal and avoids polluting the component with test attributes for elements tests don't touch.

**Why not class selectors for these two?** The class names `.trip-name` and `.signed-in-label` serve dual purpose (CSS styling + test targeting). If a designer renames `.trip-name` to `.trip-title`, the test breaks silently. `data-testid` communicates explicit test intent and decouples tests from styling.

**Resulting selectors in tests:**
```typescript
// auth.spec.ts
await expect(page.locator('[data-testid="signed-in-label"]')).toBeVisible();

// trip.spec.ts
await expect(page.locator('[data-testid="trip-name"]').filter({ hasText: tripName })).toBeVisible();
```

---

## Fixture Strategy (Recommendation)

### Current state
`playwright.config.ts` already sets `use.storageState: '.auth/user.json'` globally. Every test gets an authenticated page context with no fixture needed. [VERIFIED: apps/e2e/playwright.config.ts]

### Options

**Option A: Skip fixtures entirely.** Import `{ test, expect }` directly from `@playwright/test` in each test file.
- Pro: zero ceremony
- Con: if auth ever needs per-test customization (e.g., different users), every test file must be updated

**Option B: Create `src/fixtures/index.ts` as a re-export stub.**
```typescript
// src/fixtures/index.ts
import { test as base, expect } from '@playwright/test';
export { expect };
export const test = base.extend({});
```
- Pro: all tests import from `'../src/fixtures'` — one place to add custom fixtures later
- Pro: 3 lines of code, zero runtime overhead
- Con: minimal — adds one file

### Recommendation: Create the fixture stub (Option B)

The cost is one file and 3 lines. The benefit is a stable import contract: when Phase 5+ adds custom fixtures (authenticated DB clients, per-test trip cleanup, multiple user contexts), zero test files need import changes. Given the project already has `src/auth/`, `src/db/`, and `src/config.ts` — a `src/fixtures/` directory fits the established pattern.

**File: `apps/e2e/src/fixtures/index.ts`**
```typescript
import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({});
```

---

## auth.spec.ts Skeleton

```typescript
// tests/auth.spec.ts
import { test, expect } from '../src/fixtures/index.js';

test.describe('Authentication', () => {
  test('app loads and signed-in label is visible', async ({ page }) => {
    await page.goto('/');

    // The Amplify Authenticator has already completed (storageState from global setup)
    // Assert the signed-in label is present in the DOM
    await expect(page.locator('[data-testid="signed-in-label"]')).toBeVisible();

    // Optional: verify the "My Trips" section renders (confirms full app mount)
    await expect(page.getByRole('heading', { name: 'My Trips' })).toBeVisible();
  });
});
```

**Notes:**
- No explicit login steps — `storageState` handles it
- `page.goto('/')` is sufficient; `baseURL` is set in playwright.config.ts
- The Amplify Authenticator form will NOT appear because Cognito tokens are already in storageState
- If tokens are expired, `loginAndSaveState` in globalSetup regenerates them (it runs on every `pnpm e2e` invocation)
- Adding the `My Trips` heading check covers TEST-01 more completely (confirms the app rendered past auth, not just that a p tag exists)

---

## trip.spec.ts Skeleton

```typescript
// tests/trip.spec.ts
import { test, expect } from '../src/fixtures/index.js';

test.describe('Trip creation', () => {
  test('create a trip via UI and verify it appears in the list', async ({ page }) => {
    // Use a unique name so the assertion is unambiguous even if prior test runs
    // left stale data (DynamoDB Local is deleted in global teardown, but local
    // reuseExistingServer runs may have leftover state from a previous session)
    const tripName = `E2E Trip ${Date.now()}`;

    await page.goto('/');

    // Wait for the app to fully render before interacting
    await expect(page.getByRole('heading', { name: 'My Trips' })).toBeVisible();

    // Open the create form
    await page.getByRole('button', { name: '+ New Trip' }).click();

    // Fill in the trip name
    await page.getByPlaceholder('Trip name').fill(tripName);

    // Submit — wait for the POST /api/trips response to confirm the API call landed
    const [response] = await Promise.all([
      page.waitForResponse((resp) =>
        resp.url().includes('/api/trips') && resp.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Create' }).click(),
    ]);
    expect(response.status()).toBe(201);

    // Assert the new trip appears in the list
    await expect(
      page.locator('[data-testid="trip-name"]').filter({ hasText: tripName }),
    ).toBeVisible();
  });
});
```

**Design decisions documented:**

1. **`Date.now()` in trip name** — prevents false positives when `reuseExistingServer: true` (local dev) leaves stale trips from a previous run. The table is freshly created on each `pnpm e2e` run via globalSetup, but locally reused servers may serve data from a prior session.

2. **`Promise.all([waitForResponse, click])`** — avoids a race condition where the response resolves before the `waitForResponse` call registers. This is the standard Playwright pattern for network assertions.

3. **`response.status() === 201`** — asserts the API call itself succeeded (not just that the UI updated). Combined with the DOM assertion, this gives precise failure diagnosis.

4. **No count assertion** — the test only asserts the new trip is visible, not that exactly N trips exist. Count assertions are brittle when test isolation is imperfect.

5. **No participant email flow** — keeping the form minimal: trip name only, no participants. This avoids the `.participant-tag` / email input complexity and stays within Phase 4 scope.

---

## Network Wait Strategy

**Recommended:** `Promise.all([page.waitForResponse(...), button.click()])` as shown in the trip.spec.ts skeleton.

**Why not just `await expect(locator).toBeVisible()`?** For the trip creation test, waiting for the DOM update alone is acceptable — Playwright's auto-retry will poll until the element appears. However, asserting `response.status() === 201` alongside provides a better error message when the API fails: "Expected 201 got 500" is more actionable than "Timeout waiting for element."

**For auth.spec.ts:** No network wait needed — `page.goto('/')` is sufficient. The `storageState` means Cognito token refresh happens in the background and the app renders directly to the authenticated state.

---

## Test Independence Analysis

| Spec | DynamoDB dependency | Auth dependency | Isolation |
|------|--------------------|-----------------|-|
| `auth.spec.ts` | None — only asserts DOM state | Reads `.auth/user.json` (from storageState) | Fully independent |
| `trip.spec.ts` | Writes TRIP#<uuid> + USER#<email> records | Reads `.auth/user.json` | Writes persist until global teardown; timestamp-unique name prevents cross-run conflicts |

- `auth.spec.ts` has zero DynamoDB dependency. It would pass even if the table were empty or missing (auth is Cognito, not DynamoDB).
- `trip.spec.ts` writes data that persists in DynamoDB Local for the duration of the test run. Since there's no count assertion, this is safe.
- Running the two specs in either order produces the same result.

---

## Common Pitfalls

### Pitfall 1: Amplify Authenticator renders on page.goto('/') because storageState tokens expired
**What goes wrong:** `page.goto('/')` shows the login form instead of the app. The test hangs on `[data-testid="signed-in-label"]` until timeout.
**Why it happens:** Cognito ID tokens expire after 1 hour. If a developer runs `pnpm e2e` more than 1 hour after the previous run and `reuseExistingServer: true` kept the `.auth/user.json` from the previous session, the tokens in storageState are stale.
**How to avoid:** `loginAndSaveState()` runs in `globalSetup` on every `pnpm e2e` invocation — it always generates fresh tokens. The risk is only if a developer manually copies a stale `.auth/user.json`.
**Detection:** If the test fails on the signed-in label assertion and the page shows an Amplify Authenticator form, tokens expired.
**Mitigation already in place:** `globalTeardown` deletes `.auth/user.json` after every run, forcing regeneration next time.

### Pitfall 2: `waitForResponse` registers after the response has already arrived
**What goes wrong:** `page.getByRole('button', { name: 'Create' }).click()` is awaited before `page.waitForResponse(...)` is called. The response resolves during the click and the `waitForResponse` call never sees it — test hangs.
**How to avoid:** Always use `Promise.all([page.waitForResponse(...), button.click()])` — registers the listener before the action fires.

### Pitfall 3: Trip name collision in local dev with `reuseExistingServer: true`
**What goes wrong:** A previous test run created a trip named "My E2E Trip". A new run creates another trip with the same name. The assertion `filter({ hasText: 'My E2E Trip' })` matches the old one, not the new one — test passes spuriously OR fails because the form validation prevented a duplicate (if added in future).
**How to avoid:** Use `Date.now()` or `crypto.randomUUID()` in the trip name to guarantee uniqueness.

### Pitfall 4: `.trip-name` selector matches multiple elements
**What goes wrong:** If multiple trips exist (from prior runs with reused server), `page.locator('[data-testid="trip-name"]')` matches multiple elements. Playwright assertions on multiple matches require `.first()` or `.filter()`.
**How to avoid:** Always use `.filter({ hasText: tripName })` with the unique timestamp name to target exactly one element.

### Pitfall 5: ESM import extension requirement
**What goes wrong:** `import { test, expect } from '../src/fixtures/index'` fails at runtime with `ERR_MODULE_NOT_FOUND` in ESM mode.
**Why it happens:** The `apps/e2e` package is `"type": "module"` — TypeScript compiles to `.js` and Node.js ESM requires explicit `.js` extensions on relative imports.
**How to avoid:** Use `.js` extension on all relative imports in test files: `from '../src/fixtures/index.js'`. This matches the `apps/api` convention documented in CLAUDE.md.

---

## Runtime State Inventory

Not applicable — Phase 4 is a greenfield addition of test files. No rename/refactor involved.

---

## Environment Availability

All external dependencies are already established by Phases 1–3. No new environment requirements.

| Dependency | Required By | Status | Notes |
|------------|-------------|--------|-------|
| Docker (testcontainers) | global-setup.ts | Already wired | Phase 2 |
| DynamoDB Local | init.ts / tests | Already wired | Phase 2 |
| Cognito test user | login.ts | Already wired | Phase 2 |
| Playwright Chromium | test runner | Already installed | Phase 1 |
| BASE_URL env | playwright.config.ts | Already wired | Phases 1-2 |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test 1.60.0 |
| Config file | `apps/e2e/playwright.config.ts` |
| Quick run command | `pnpm --filter @packpixie/e2e e2e --project=chromium` |
| Full suite command | `pnpm e2e` (from repo root) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TEST-01 | App loads, signed-in label visible | E2E smoke | `pnpm --filter @packpixie/e2e e2e tests/auth.spec.ts` | ❌ Wave 0 |
| TEST-02 | Create trip via UI, trip appears in list | E2E flow | `pnpm --filter @packpixie/e2e e2e tests/trip.spec.ts` | ❌ Wave 0 |
| TEST-03 | Tests pass in CI without code changes | E2E (CI run) | Covered by CI workflow from Phase 3 | N/A |

### Wave 0 Gaps
- [ ] `apps/e2e/tests/auth.spec.ts` — covers TEST-01
- [ ] `apps/e2e/tests/trip.spec.ts` — covers TEST-02
- [ ] `apps/e2e/src/fixtures/index.ts` — optional but recommended shared import

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | Cognito auth already established; tests consume existing auth, don't implement it |
| V3 Session Management | Partially | storageState tokens managed by Playwright; globalTeardown deletes `.auth/user.json` |
| V5 Input Validation | No | Test data is hardcoded strings, not user-supplied input |
| V6 Cryptography | No | No cryptographic operations in test files |

### Security Notes
- Test credentials live in `.env.test` which is in `.gitignore` (verified from Phase 1/2 deliverables). CI injects credentials via GitHub Actions secrets — no plaintext exposure.
- The `Date.now()` trip name in trip.spec.ts contains no PII.
- No secrets are logged or printed to stdout in the test files.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 4 |
|-----------|-------------------|
| User identity from JWT claims, never request body | N/A for test files; the API routes already enforce this |
| Use `.js` extensions on relative imports in ESM packages | **Must apply** to all imports in `apps/e2e/tests/*.ts` and `src/fixtures/index.ts` |
| Do not remove TODO comments | N/A |
| Keep CLAUDE.md lean | N/A |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Playwright's `getByRole('button', { name: '+ New Trip' })` matches the "+ New Trip" button text | TripList Selectors | Low — button text confirmed from source; Playwright role matching is well-documented |
| A2 | `storageState` prevents the Amplify Authenticator from rendering on `page.goto('/')` | auth.spec.ts design | Low — confirmed behavior of Amplify UI with pre-loaded Cognito tokens in localStorage via storageState |
| A3 | Adding `data-testid` to client source files is acceptable scope for Phase 4 | Selector Strategy | Medium — if the planner/user considers client changes out of scope, fall back to class selectors `.trip-name` and `.signed-in-label` |
| A4 | No existing tests exist in `apps/e2e/tests/` (only `.gitkeep`) | Test directory | Verified — `list_dir` showed only `.gitkeep` |

**Fallback for A3:** If adding `data-testid` is rejected, use class selectors directly:
```typescript
// Instead of data-testid:
await expect(page.locator('.signed-in-label')).toBeVisible();
await expect(page.locator('.trip-name').filter({ hasText: tripName })).toBeVisible();
```
These are stable as long as the CSS class names don't change — acceptable risk for Phase 4.

---

## Open Questions

1. **data-testid scope**
   - What we know: No `data-testid` attributes exist. Phase 4 needs to assert two non-semantic elements.
   - What's unclear: Whether the planner/user considers touching `apps/client/src/` to be within scope for a phase described as "E2E tests."
   - Recommendation: Include the two `data-testid` additions in the plan as Wave 0 tasks. They are 2-line changes and directly enable stable assertions. Document the class-selector fallback in the plan.

2. **`My Trips` heading in auth.spec.ts**
   - What we know: `TripList.tsx` renders `<h2>My Trips</h2>`. The test could assert this for a richer smoke test.
   - What's unclear: Whether asserting the heading is over-specifying for a "login smoke test."
   - Recommendation: Include it — asserting that the full app rendered (not just the label) catches more failure modes with one additional line.

---

## Sources

### Primary (HIGH confidence)
- Direct source inspection of `apps/e2e/global-setup.ts` — exact import/call structure
- Direct source inspection of `apps/e2e/global-teardown.ts` — confirmed no seed.ts reference
- Direct source inspection of `apps/client/src/TripList.tsx` — all class names, button texts, input placeholders
- Direct source inspection of `apps/client/src/App.tsx` — `signed-in-label` class confirmed
- Direct source inspection of `apps/e2e/playwright.config.ts` — storageState, baseURL, workers confirmed
- Direct source inspection of `apps/e2e/src/auth/login.ts` — AUTH_STATE_PATH location confirmed
- Direct source inspection of `apps/e2e/package.json` — package versions confirmed

### Tertiary (LOW confidence / ASSUMED)
- Playwright `Promise.all([waitForResponse, click])` pattern — standard documented pattern [ASSUMED: training knowledge; well-established Playwright idiom]
- Amplify storageState behavior with Cognito tokens — [ASSUMED: training knowledge]

---

## Metadata

**Confidence breakdown:**
- global-setup.ts exact changes: HIGH — direct source inspection, zero ambiguity
- global-teardown.ts: HIGH — confirmed no seed.ts reference
- TripList.tsx selectors: HIGH — all selectors verified against live source
- Fixture strategy: HIGH — recommendation is conservative and low-risk
- Network wait pattern: MEDIUM — assumed idiom, well-established

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (stable — no external dependencies; all inputs are local source files)
