---
phase: 03-github-actions-ci-pipeline
plan: "01-03"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/e2e/playwright.config.ts
  - .github/workflows/e2e.yml
  - apps/e2e/README.md
autonomous: true
requirements:
  - CI-01
  - CI-02
  - CI-03
  - CI-04
  - CI-05
must_haves:
  truths:
    - E2E workflow triggers on push to main and on pull_request targeting main (D-01)
    - DynamoDB Local starts via testcontainers — no services: block needed (D-02)
    - All 12 required env vars present; the four sensitive ones come from GitHub secrets (D-03, D-09)
    - Playwright HTML report is always written to disk and uploaded as an artifact with 7-day retention (D-05)
    - README documents the four required secrets with their sources and the branch protection requirement (CI-05)
  artifacts:
    - .github/workflows/e2e.yml
    - apps/e2e/playwright.config.ts (reporter changed to array form enabling HTML output in CI)
    - apps/e2e/README.md (Setting up CI section added)
  key_links:
    - CI reporter array form → playwright-report/ directory written → upload-artifact has content (D-05)
    - VITE_COGNITO_USER_POOL_CLIENT_ID mapped from COGNITO_CLIENT_ID secret → Amplify UI authenticates (D-03, D-09)
    - pnpm --filter model build step → packages/model/dist/ exists → API and client webServer start without crashing
---

<objective>
Wire the full E2E suite into GitHub Actions. A single job named e2e runs on every push to
main and every PR targeting main; it builds the model package, installs Playwright browsers
with system deps, runs the full suite (DynamoDB Local starts automatically via testcontainers),
and always uploads the HTML report and test-results as a 7-day artifact.

Three files change: playwright.config.ts gains the CI reporter fix that enables HTML file output;
.github/workflows/e2e.yml is the new CI pipeline; apps/e2e/README.md gains a Setting up CI
section documenting the required secrets and branch protection configuration.

Purpose: PRs cannot merge unless the E2E Tests status check passes — enforced via GitHub branch
protection rules on main (configured externally, documented in README).
Output: .github/workflows/e2e.yml, updated playwright.config.ts, updated README.md.
</objective>

<execution_context>
@.github/gsd-core/workflows/execute-plan.md
@.github/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/02-stack-orchestration-db-initialization/02-SUMMARY.md

# Existing workflow pattern to mirror exactly
@.github/workflows/lint.yml

# Files being modified — read before editing
@apps/e2e/playwright.config.ts
@apps/e2e/README.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix CI reporter in playwright.config.ts (D-05, CI-04)</name>
  <files>apps/e2e/playwright.config.ts</files>
  <action>
    In apps/e2e/playwright.config.ts, change the CI branch of the reporter option from
    the single-string shorthand to a two-element array. This is required because the
    string form 'github' emits only GitHub Actions annotations — it does not write any
    files to disk. D-05 requires an HTML report artifact, so both reporters must be active
    in CI: 'github' for PR annotations, and 'html' with open:'never' so the report is
    always written to playwright-report/ without attempting to open a browser.

    Locate the reporter field (currently lines 29–32 of playwright.config.ts):
      reporter: process.env.CI
        ? 'github'
        : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

    Replace the CI branch value from the string 'github' to the array form:
      reporter: process.env.CI
        ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
        : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

    No other lines in playwright.config.ts change. The outputFolder value 'playwright-report'
    must match the artifact upload path used in Task 2 — do not alter it.
  </action>
  <verify>
    <automated>grep -c "\[\['github'\]" apps/e2e/playwright.config.ts</automated>
  </verify>
  <done>
    grep returns 1 — exactly one line in playwright.config.ts contains [['github'],
    confirming the array form is present. The old single-string 'github' no longer
    appears as the sole CI reporter value.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create .github/workflows/e2e.yml (D-01 through D-09, CI-01 through CI-04)</name>
  <files>.github/workflows/e2e.yml</files>
  <action>
    Create .github/workflows/e2e.yml with the content below. Mirror lint.yml conventions
    exactly: checkout@v4, setup-node@v4 with node-version 22.19.0, pnpm/action-setup@v4
    with version 10.12.1, and pnpm install --frozen-lockfile. No services: block (D-02 —
    testcontainers starts DynamoDB Local automatically via global-setup.ts). No cache steps
    (D-04). All env vars declared at job level so the webServer processes spawned by
    playwright.config.ts inherit them (step-level env is not sufficient for webServer).

    The upload-artifact step uses if: always() so it runs even when tests fail (D-05).
    Both apps/e2e/playwright-report/ and apps/e2e/test-results/ are uploaded — the HTML
    report (enabled by Task 1's reporter fix) and the raw screenshots and traces.

    VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_USER_POOL_CLIENT_ID are mapped from the
    same two secrets as COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID respectively. The API
    reads the non-VITE_ names; the Vite dev server bundle reads the VITE_ prefixed names.
    Both sets must be present or one of the two webServer processes will crash on startup.

    The explicit pnpm --filter model build step is required because apps/e2e/package.json
    has no workspace dependencies, so turbo's ^build resolves to nothing for the e2e task.
    Without this step packages/model/dist/ is absent and both webServer processes fail to
    import @packpixie/model and crash immediately.

    Docker is pre-installed on ubuntu-latest runners; no setup step is needed. Testcontainers
    connects to /var/run/docker.sock automatically. Ryuk reaper handles container cleanup
    on process exit — TESTCONTAINERS_RYUK_DISABLED does not need to be set.

    --- FILE: .github/workflows/e2e.yml ---

    name: E2E Tests

    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]

    jobs:
      e2e:
        runs-on: ubuntu-latest

        env:
          # Cognito — real user pool via GitHub secrets (D-03)
          COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
          COGNITO_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
          # Vite client reads VITE_-prefixed names from the same two secrets (D-09)
          VITE_COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
          VITE_COGNITO_USER_POOL_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
          # Hardcoded values — no secrets needed (D-09)
          AWS_REGION: us-east-1
          DYNAMODB_TABLE: packpixie-test
          LOCAL_DYNAMODB_URL: http://localhost:8000
          BASE_URL: http://localhost:5173
          VITE_API_URL: http://localhost:3001
          VITE_APP_VERSION: test

        steps:
          - name: Checkout code
            uses: actions/checkout@v4

          - name: Setup Node.js
            uses: actions/setup-node@v4
            with:
              node-version: '22.19.0'

          - name: Setup pnpm
            uses: pnpm/action-setup@v4
            with:
              version: 10.12.1

          - name: Install dependencies
            run: pnpm install --frozen-lockfile

          - name: Build model package
            run: pnpm --filter model build

          - name: Install Playwright browsers
            run: pnpm --filter @packpixie/e2e run install:browsers

          - name: Run E2E tests
            run: pnpm test:e2e

          - name: Upload Playwright report
            uses: actions/upload-artifact@v4
            if: always()
            with:
              name: playwright-report
              path: |
                apps/e2e/playwright-report/
                apps/e2e/test-results/
              retention-days: 7

    --- END FILE ---
  </action>
  <verify>
    <automated>
      test -f .github/workflows/e2e.yml &&
      grep -c "upload-artifact@v4" .github/workflows/e2e.yml &&
      grep -c "VITE_COGNITO_USER_POOL_CLIENT_ID" .github/workflows/e2e.yml &&
      grep -c "pnpm --filter model build" .github/workflows/e2e.yml
    </automated>
  </verify>
  <done>
    File exists. All three grep calls return 1 — confirming the artifact upload step,
    the Vite secret name mapping, and the explicit model build step are all present.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Setting up CI section to apps/e2e/README.md (D-01, D-03, CI-05)</name>
  <files>apps/e2e/README.md</files>
  <action>
    Append a new "## Setting up CI" section immediately after the existing "## CI" paragraph
    in apps/e2e/README.md. The existing CI paragraph ends with the sentence
    "See `.github/workflows/e2e.yml` (Phase 3) for the full CI pipeline."

    The new section must contain three sub-topics:

    1. Required GitHub secrets — list all four with their names and where to find each value:
       - COGNITO_USER_POOL_ID: AWS Console → Cognito → User Pools → select pool → Pool ID.
         Also available via: terraform output -raw cognito_user_pool_id (from infra/).
       - COGNITO_CLIENT_ID: AWS Console → Cognito → User Pools → select pool → App clients → Client ID.
         Also available via: terraform output -raw cognito_user_pool_client_id (from infra/).
       - TEST_USER_EMAIL: The email address of the Cognito test user (same value as in local .env.test).
       - TEST_USER_PASSWORD: The password of the Cognito test user (same value as in local .env.test).

    2. How to add secrets: GitHub repository → Settings → Secrets and variables → Actions →
       New repository secret. Add each of the four secrets listed above.

    3. Branch protection note: The workflow job is named "e2e" under the workflow "E2E Tests".
       To make it a required status check, configure GitHub branch protection:
       GitHub repository → Settings → Branches → Branch protection rules → main →
       enable "Require status checks to pass before merging" → search for and add
       "E2E Tests / e2e". With this enabled, PRs cannot merge if the E2E job fails.

    Preserve all existing content in README.md — only append the new section, do not
    remove or reorder existing sections.
  </action>
  <verify>
    <automated>grep -c "Setting up CI" apps/e2e/README.md</automated>
  </verify>
  <done>
    grep returns 1 — the "Setting up CI" heading exists exactly once in README.md.
    All four secret names are present in the section with their source locations.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub secrets → job env vars | Four sensitive values (Cognito + test credentials) cross from encrypted secret store into the job environment |
| CI runner → Docker socket | testcontainers connects to /var/run/docker.sock to pull and start amazon/dynamodb-local |
| E2E job → real Cognito User Pool | Tests authenticate against the live Cognito pool; a leaked TEST_USER_PASSWORD could allow account abuse |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-03-01 | Information Disclosure | GitHub Actions log output | medium | mitigate | All secrets injected via ${{ secrets.* }} — GitHub Actions automatically masks secret values in logs |
| T-03-02 | Tampering | pnpm install --frozen-lockfile | medium | mitigate | --frozen-lockfile fails the job if pnpm-lock.yaml is out of sync; no silent dependency resolution |
| T-03-03 | Information Disclosure | Playwright HTML report artifact | low | accept | Artifacts are scoped to the repository; only repo members with Actions read access can download; no secrets embedded in HTML |
| T-03-04 | Elevation of Privilege | ubuntu-latest runner isolation | low | accept | GitHub-hosted runners are ephemeral fresh VMs per job; no persistent state or cross-job access |
| T-03-05 | Denial of Service | testcontainers Ryuk reaper on CI | low | accept | Runners are ephemeral; a failed Ryuk cleanup only affects the current run, not subsequent ones |
| T-03-06 | Information Disclosure | TEST_USER_PASSWORD secret rotation | medium | mitigate | Secret is scoped to GitHub Actions only; rotate via AWS Cognito and update GitHub secret if compromised |
| T-03-SC | Tampering | npm/pnpm package installs | high | mitigate | No new packages installed in Phase 3; all dependencies already in pnpm-lock.yaml from Phases 1–2 |
</threat_model>

<verification>
After all three tasks complete:

1. playwright.config.ts — grep for array reporter form returns 1
2. .github/workflows/e2e.yml — exists with correct triggers, env block, model build step, artifact upload
3. README.md — "Setting up CI" section present with all four secret names
4. Full structural check:
   test -f .github/workflows/e2e.yml &&
   grep -c "pull_request" .github/workflows/e2e.yml &&
   grep -c "if: always()" .github/workflows/e2e.yml &&
   grep -c "retention-days: 7" .github/workflows/e2e.yml
5. End-to-end smoke: push to a feature branch; verify "E2E Tests" workflow appears in the
   GitHub Actions tab and fails fast with a clear secrets-missing error if secrets are not yet configured
   (confirming the workflow file is syntactically valid and the required() guards fire correctly)
</verification>

<success_criteria>
- Push to main or a PR targeting main triggers the "E2E Tests" workflow (CI-01)
- Workflow has no services: block; DynamoDB Local starts inside the job via testcontainers (CI-02)
- All four Cognito secrets are injected as env vars at job level; the required() guard in
  apps/e2e/src/config.ts throws immediately on missing values before any test runs (CI-03)
- playwright-report/ and test-results/ are uploaded as a single artifact with 7-day retention
  and if: always() so it runs regardless of test outcome (CI-04)
- README.md documents all four required secrets with their AWS Console and Terraform sources,
  how to add them to GitHub Actions, and the branch protection configuration step (CI-05)
</success_criteria>

<output>
Create `.planning/phases/03-github-actions-ci-pipeline/03-SUMMARY.md` when done
</output>
