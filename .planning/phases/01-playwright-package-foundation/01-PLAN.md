# Phase 1: Playwright Package Foundation — Plan

**Phase goal:** `apps/e2e` workspace package exists, Playwright is installed and configured, and a developer can run `pnpm test:e2e` from repo root and get "no tests found" — not a config error.
**Requirements:** PKG-01, PKG-02, PKG-03, PKG-04, PW-01, PW-02, PW-03, PW-04, PW-05
**Granularity:** Standard (3 plans, 10 tasks)
**Parallelization:** Plan 1 and Plan 2 run in parallel (Wave 1); Plan 3 follows (Wave 2)

---

## Wave Structure

```
Wave 1 (parallel):
  Plan 1 — apps/e2e Package Scaffold
  Plan 2 — Turbo + Root Script Integration

Wave 2 (after both Wave 1 plans complete):
  Plan 3 — playwright.config.ts + Install Verification
```

---

## Plans

---

### Plan 1: apps/e2e Package Scaffold

**Wave:** 1
**Parallelizable with:** Plan 2
**Requirements covered:** PKG-01, PKG-02, PW-04

**Goal:** Create the `apps/e2e` workspace package — `package.json`, `tsconfig.json`, empty test directory, and `.gitignore`. After this plan, pnpm recognizes `@packpixie/e2e` as a workspace member.

> PKG-02 note: `pnpm-workspace.yaml` already has `apps/*` — no change needed. Verified against pnpm-workspace.yaml in repo.

---

#### T1.1 — Create `apps/e2e/package.json`

**File:** `apps/e2e/package.json`

**Done condition:** File exists with exact content below.

**Content:**

```json
{
  "name": "@packpixie/e2e",
  "version": "1.0.0",
  "description": "PackPixie end-to-end tests",
  "type": "module",
  "private": true,
  "scripts": {
    "e2e": "playwright test",
    "install:browsers": "playwright install --with-deps chromium"
  },
  "devDependencies": {
    "@playwright/test": "1.60.0"
  }
}
```

**Critical constraints:**

- Version is `"1.60.0"` — exact, no `^`. The workspace `minimumReleaseAge: 20160` (14-day strict mode) blocks Playwright 1.61.0 (12 days old) and 1.61.1 (4 days old). 1.60.0 (47 days old) is the newest allowed version. Adding `^` would let pnpm resolve to a blocked version.
- `"e2e": "playwright test"` — this is the exact script name Turbo invokes (per D-03).
- `"install:browsers"` — must be run once after `pnpm install` to download Chromium binary. Not a postinstall hook (postinstall runs on every `pnpm install`, slowing all developer installs).
- `"private": true` — workspace package, never published.

---

#### T1.2 — Create `apps/e2e/tsconfig.json`

**File:** `apps/e2e/tsconfig.json`

**Done condition:** File exists with exact content below.

**Content:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "sourceMap": true
  },
  "include": ["playwright.config.ts", "tests/**/*"],
  "exclude": ["node_modules"]
}
```

**Notes:**

- Mirrors `apps/api/tsconfig.json` (ES2022, ESNext, strict) per CONTEXT.md agent discretion decision.
- No `outDir` — Playwright uses its own esbuild-based TypeScript transpiler; this tsconfig is for IDE intelligence only.
- No `rootDir` restriction — test files and config live at `apps/e2e/` root, not inside a `src/` subdirectory.
- No `declaration`/`declarationMap` — not needed for test files that are never imported by other packages.
- `include` covers `playwright.config.ts` explicitly so editors type-check the config file.

---

#### T1.3 — Create `apps/e2e/tests/.gitkeep`

**File:** `apps/e2e/tests/.gitkeep`

**Done condition:** File exists (empty). Commits the `tests/` directory so Playwright's `testDir: './tests'` resolves without warning.

**Content:** _(empty file)_

---

#### T1.4 — Create `apps/e2e/.gitignore`

**File:** `apps/e2e/.gitignore`

**Done condition:** File exists with exact content below.

**Content:**

```
node_modules/
test-results/
playwright-report/
```

**Notes:**

- `test-results/` — Playwright's `outputDir` (screenshots, traces).
- `playwright-report/` — HTML reporter output directory.
- Browser binaries are stored in `~/.cache/ms-playwright` (OS-level), not in the repo — no entry needed for them.

---

**Plan 1 Verification:**

```bash
# From repo root — must succeed
pnpm install

# Confirm pnpm recognizes the new workspace member
pnpm list -r --depth=0 | grep '@packpixie/e2e'
```

Expected: `pnpm install` exits 0 and `pnpm list` output includes `@packpixie/e2e 1.0.0`.

---

---

### Plan 2: Turbo + Root Script Integration

**Wave:** 1
**Parallelizable with:** Plan 1
**Requirements covered:** PKG-03, PKG-04

**Goal:** Wire the `e2e` Turbo task and root `test:e2e` script so that `pnpm test:e2e` from the repo root propagates through Turbo to `apps/e2e`. The existing `test` task and `test` script are left untouched (D-04).

---

#### T2.1 — Add `e2e` task to `turbo.json`

**File:** `turbo.json`

**Done condition:** `turbo.json` contains the `e2e` task alongside the existing tasks. All existing tasks are unchanged.

**Current `turbo.json`:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "type-check": { "dependsOn": ["^build"], "outputs": [] },
    "clean": { "cache": false }
  }
}
```

**Target state — add `e2e` entry inside `"tasks"`, after the `"clean"` entry:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "type-check": { "dependsOn": ["^build"], "outputs": [] },
    "clean": { "cache": false },
    "e2e": {
      "dependsOn": ["^build"],
      "cache": false
    }
  }
}
```

**Task design rationale (per D-02):**

- `"dependsOn": ["^build"]` — Turbo builds `packages/model` and any other workspace dependencies before running Playwright. The `^` means "build all packages this package depends on" — since `apps/e2e` has no build step itself, Turbo skips the build for e2e but still builds its upstream deps.
- `"cache": false` — E2E results depend on runtime state (browser, live servers). Caching would produce stale green/red signals. Correct approach.
- No `"persistent": true` — Playwright runs exit when done. `persistent` is for watch-mode servers that never exit. Adding it here would be semantically wrong.
- No `"outputs"` — nothing to cache (cache is disabled). Omitting is correct.

---

#### T2.2 — Add `test:e2e` script to root `package.json`

**File:** `package.json` (repo root)

**Done condition:** Root `package.json` has `"test:e2e"` in scripts. The `"test"` script is unchanged (D-04).

**Current scripts section:**

```json
"scripts": {
  "build": "turbo run build",
  "dev": "turbo run dev",
  "lint": "turbo run lint",
  "clean": "turbo run clean",
  "type-check": "turbo run type-check",
  "test": "turbo run test",
  "prepare": "husky",
  "purge": "rm -rf node_modules apps/api/node_modules ..."
}
```

**Target state — add `test:e2e` after `test`:**

```json
"scripts": {
  "build": "turbo run build",
  "dev": "turbo run dev",
  "lint": "turbo run lint",
  "clean": "turbo run clean",
  "type-check": "turbo run type-check",
  "test": "turbo run test",
  "test:e2e": "turbo run e2e",
  "prepare": "husky",
  "purge": "rm -rf node_modules apps/api/node_modules ..."
}
```

**Flow when `pnpm test:e2e` runs (per D-03):**

1. Root `pnpm test:e2e` invokes `turbo run e2e`
2. Turbo finds all workspace packages with an `e2e` script — only `apps/e2e` has one
3. Turbo runs `^build` deps (builds `packages/model`)
4. Turbo invokes `playwright test` inside `apps/e2e`

---

**Plan 2 Verification:**

```bash
# Confirm e2e task is present in turbo.json
node -e "const t = JSON.parse(require('fs').readFileSync('turbo.json','utf8')); console.log(JSON.stringify(t.tasks.e2e))"
# Expected: {"dependsOn":["^build"],"cache":false}

# Confirm test:e2e script is present in root package.json
node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.scripts['test:e2e'])"
# Expected: turbo run e2e

# Confirm test script is still untouched (D-04 guard)
node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.scripts['test'])"
# Expected: turbo run test
```

---

---

### Plan 3: Playwright Config + Install Verification

**Wave:** 2
**Depends on:** Plan 1, Plan 2
**Requirements covered:** PW-01, PW-02, PW-03, PW-04, PW-05

**Goal:** Create `playwright.config.ts` with full CI/local configuration, run `pnpm install` to resolve the new package, install the Chromium browser binary, and verify that `pnpm test:e2e` exits cleanly with "no tests found" rather than a config error.

---

#### T3.1 — Create `apps/e2e/playwright.config.ts`

**File:** `apps/e2e/playwright.config.ts`

**Done condition:** File exists with exact content below.

**Content:**

```typescript
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

  // Settings shared across all test projects
  use: {
    // Target the Vite dev server; override with BASE_URL env var (PW-02, PW-03)
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',

    // Collect trace on first retry; keeps artifact size manageable
    trace: 'on-first-retry',

    // Screenshot only on failure
    screenshot: 'only-on-failure',
  },

  // Chromium only — D-01
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

**Configuration decisions:**

- No `globalSetup` / `globalTeardown` — that is Phase 2 scope (ORCH-01–05).
- `baseURL: process.env.BASE_URL ?? 'http://localhost:5173'` — Vite dev server default, overridable (PW-02, PW-03).
- `reporter: process.env.CI ? 'github' : [['html', ...]]` — GitHub Actions reporter annotates PRs inline; HTML reporter opens browser on failure locally (PW-05).
- `outputDir: 'test-results'` — matches the `.gitignore` entry from T1.4 (PW-04).
- `projects: [{ name: 'chromium' }]` — D-01, Chromium only.
- `forbidOnly: !!process.env.CI` — prevents `test.only` commits from silently passing all other tests on CI.

---

#### T3.2 — Install dependencies

**Done condition:** `pnpm install` succeeds and `apps/e2e/node_modules/@playwright/test` exists.

**Commands to run (from repo root):**

```bash
pnpm install
```

This resolves `@playwright/test@1.60.0` (exact version, satisfies the 14-day minimumReleaseAge constraint) and links `@packpixie/e2e` into the workspace.

**Verify:**

```bash
ls apps/e2e/node_modules/@playwright/test/package.json
# Expected: file exists

node -e "const p = JSON.parse(require('fs').readFileSync('apps/e2e/node_modules/@playwright/test/package.json','utf8')); console.log(p.version)"
# Expected: 1.60.0
```

---

#### T3.3 — Install Chromium browser binary

**Done condition:** Chromium binary is installed in `~/.cache/ms-playwright`. Subsequent runs skip download.

**Command to run (from repo root):**

```bash
pnpm --filter @packpixie/e2e run install:browsers
```

This invokes `playwright install --with-deps chromium` inside `apps/e2e`, downloading the pinned Chromium binary matching Playwright 1.60.0 and its system dependencies (fonts, nss, etc.).

**Notes:**

- Installs to `~/.cache/ms-playwright/chromium-{build-number}/` — shared across projects on the machine, not committed to git.
- `--with-deps` installs OS-level dependencies (required on Linux/CI). On macOS this is a no-op but harmless.
- **Must be run after every `pnpm install`** if Playwright version changes. Document this in Phase 2's README task.
- CI: this command will be its own step in the GitHub Actions workflow (Phase 3). For now, run it manually once.

**Verify:**

```bash
pnpm --filter @packpixie/e2e exec playwright install --list
# Expected: output includes "chromium" with a path under ~/.cache/ms-playwright
```

---

#### T3.4 — Smoke-test: `pnpm test:e2e` exits cleanly

**Done condition:** `pnpm test:e2e` from repo root exits with "no tests found" status — **not** a config error, import error, or TypeScript error.

**Command:**

```bash
pnpm test:e2e
```

**Expected output (Playwright 1.60.0 with empty `tests/` directory):**

```
Running 0 tests using 1 worker

  Error: No tests found
```

Playwright exits with code 1 when no tests exist (this is expected behavior — the suite is empty). The important signal is that the error is "No tests found", not a config parse error, import error, or missing browser error.

**If you see a config error instead**, check:

- `apps/e2e/playwright.config.ts` exists and TypeScript is valid
- `apps/e2e/node_modules/@playwright/test` is present (run T3.2)
- Chromium binary is installed (run T3.3)

**UAT gate:** This task is the Phase 1 acceptance gate. "No tests found" from Playwright = Phase 1 complete.

---

**Plan 3 Verification:**

```bash
# Run the full chain
pnpm test:e2e 2>&1 | grep -i "no tests\|error\|config"
```

Pass condition: output contains "No tests found". Fail condition: output contains "Cannot find module", "SyntaxError", "Error loading config", or similar.

---

---

## Threat Model

| Risk                                                                          | Probability                     | Impact                                                 | Mitigation                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm resolves Playwright to 1.61.x (blocked version)                          | High if `^` prefix used         | Build broken, all installs fail                        | Pin to `"1.60.0"` exact — no caret. The `minimumReleaseAgeStrict: true` in pnpm-workspace.yaml would then fail the install with a clear error. |
| Chromium binary not installed before `pnpm test:e2e`                          | High (developer onboarding)     | `browserType.launch` error instead of "no tests found" | Document `pnpm --filter @packpixie/e2e run install:browsers` explicitly in T3.3. Phase 2 will add README with setup instructions.              |
| `turbo run e2e` picks up unexpected packages with `e2e` script                | Low                             | No harm, just unexpected                               | Only `apps/e2e` has the `e2e` script — verified by reading all other package.json files.                                                       |
| `test` Turbo task or `test` root script accidentally modified                 | Medium (editing adjacent lines) | Breaks existing test workflow                          | T2.1 and T2.2 explicitly call out the unchanged lines. Verify with D-04 guard commands.                                                        |
| `.gitignore` missing `playwright-report/` causing large HTML report committed | Low                             | Noisy commits                                          | T1.4 includes the entry.                                                                                                                       |

---

## UAT Criteria (from ROADMAP.md)

1. **`pnpm install` succeeds** with `apps/e2e` recognized as a workspace package.
   - Verified by: `pnpm list -r --depth=0 | grep '@packpixie/e2e'`

2. **`pnpm test:e2e` exits with "no tests found"** rather than a configuration error.
   - Verified by: running `pnpm test:e2e` and seeing "No tests found" (not a module/config error).

3. **Playwright config reads `BASE_URL` from env**, falls back to `http://localhost:5173`.
   - Verified by: reading `playwright.config.ts` — `process.env.BASE_URL ?? 'http://localhost:5173'` is present.

---

## Requirements Coverage

| Requirement | Description                                                                         | Plan           | Task(s)                                 |
| ----------- | ----------------------------------------------------------------------------------- | -------------- | --------------------------------------- |
| PKG-01      | `apps/e2e` exists as pnpm workspace package with `package.json` and `tsconfig.json` | Plan 1         | T1.1, T1.2                              |
| PKG-02      | `pnpm-workspace.yaml` includes `apps/e2e` (via `apps/*` glob — no change needed)    | —              | Pre-satisfied (verified in RESEARCH.md) |
| PKG-03      | `turbo.json` includes an `e2e` task definition                                      | Plan 2         | T2.1                                    |
| PKG-04      | `pnpm test:e2e` at repo root triggers the E2E suite                                 | Plan 2         | T2.2                                    |
| PW-01       | `playwright.config.ts` configured with TypeScript and ESM                           | Plan 3         | T3.1                                    |
| PW-02       | Playwright targets the running Vite dev server URL                                  | Plan 3         | T3.1 (`baseURL`)                        |
| PW-03       | Base URL configurable via `BASE_URL` env var                                        | Plan 3         | T3.1 (`process.env.BASE_URL`)           |
| PW-04       | Test artifacts saved to local directory (`test-results/`)                           | Plan 1, Plan 3 | T1.4 (gitignore), T3.1 (`outputDir`)    |
| PW-05       | Reporter configured for CI (GitHub) and local (HTML)                                | Plan 3         | T3.1 (`reporter`)                       |

**Out of scope for Phase 1 (deferred to later phases):**

- ORCH-01–05 (Phase 2): No globalSetup/globalTeardown, no server orchestration
- DB-01–04 (Phase 2): No DynamoDB Local
- AUTH-01–04 (Phase 2): No Cognito test user
- CI-01–05 (Phase 3): No GitHub Actions workflow
- TEST-01–03 (Phase 4): No actual test files

---

## Execution Order

```
Step 1 (parallel — can be done in any order or simultaneously):
  → Execute Plan 1: create apps/e2e/{package.json,tsconfig.json,tests/.gitkeep,.gitignore}
  → Execute Plan 2: edit turbo.json + root package.json

Step 2 (after both Plan 1 and Plan 2 are complete):
  → Execute Plan 3:
      T3.1 — create playwright.config.ts
      T3.2 — pnpm install (from repo root)
      T3.3 — install Chromium binary
      T3.4 — smoke-test: pnpm test:e2e → "No tests found"
```

---

_Plan created: 2026-06-27_
_Phase: 01-playwright-package-foundation_
