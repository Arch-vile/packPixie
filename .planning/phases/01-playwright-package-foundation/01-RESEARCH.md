# Phase 1 Research: Playwright Package Foundation

**Researched:** 2026-06-27
**Domain:** Playwright, pnpm monorepo, Turbo, TypeScript ESM
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Chromium only. No cross-browser matrix.
- **D-02:** Dedicated `e2e` Turbo task with `"dependsOn": ["^build"]`. Do NOT fold into `test` task.
- **D-03:** Root `package.json` gets `"test:e2e": "turbo run e2e"`. Local `apps/e2e` script is `"e2e": "playwright test"`.
- **D-04:** Existing `test` task and root `test` script are untouched.

### the agent's Discretion

- TypeScript config: mirror `apps/api/tsconfig.json` (ES2022 target, ESNext modules, strict mode)
- Playwright version: latest stable at time of install (see critical note below)
- Artifact directories: `test-results/`, `playwright-report/` — add to `.gitignore`
- Package name: `@packpixie/e2e`
- `apps/e2e/tests/` scaffolded empty (`.gitkeep` or placeholder)
- Base URL default: `http://localhost:5173`. Override via `BASE_URL` env var.

### Deferred Ideas (OUT OF SCOPE)

- Cross-browser testing (Firefox, Safari/WebKit)
- Playwright UI mode (`--ui`) convenience script
- Docker Compose for full local stack
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                           | Research Support                                                 |
| ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| PKG-01 | `apps/e2e` exists as a pnpm workspace package with `package.json` and `tsconfig.json` | Section 1, 5: package.json structure, tsconfig shape             |
| PKG-02 | `pnpm-workspace.yaml` includes `apps/e2e`                                             | Section 1: `apps/*` glob already covers it — no change needed    |
| PKG-03 | `turbo.json` includes an `e2e` task                                                   | Section 2: exact task config documented                          |
| PKG-04 | `pnpm test:e2e` at repo root triggers the suite                                       | Section 2: script wiring via `turbo run e2e`                     |
| PW-01  | `playwright.config.ts` configured with TypeScript and ESM                             | Section 3: full config snippet                                   |
| PW-02  | Playwright targets the running Vite dev server URL                                    | Section 3: `baseURL` config                                      |
| PW-03  | Base URL and API URL configurable via env vars                                        | Section 3: `process.env.BASE_URL` pattern                        |
| PW-04  | Test artifacts saved to local directory                                               | Section 3: `outputDir: 'test-results'`                           |
| PW-05  | Reporter configured for CI (GitHub Actions) and local (HTML)                          | Section 3: `process.env.CI ? 'github' : [['html', ...]]` pattern |

</phase_requirements>

---

## Summary

Playwright 1.60.0 is the newest version compatible with the workspace's `minimumReleaseAge: 20160` (14-day) pnpm constraint — 1.61.0 and 1.61.1 are too new and will be blocked by pnpm's strict release-age enforcement. The planner must pin to exactly `1.60.0`. Beyond the version constraint, the integration is straightforward: Playwright uses its own TypeScript transpiler and is unaffected by ESM `"type": "module"` in the package, the Turbo task is `cache: false` and non-persistent, and the `playwright.config.ts` uses a standard CI/local reporter toggle via `process.env.CI`.

**Primary recommendation:** Pin `@playwright/test@1.60.0` exactly. Use the `github` reporter on CI and HTML reporter locally. Set `cache: false` on the Turbo `e2e` task (no `persistent: true`).

---

## Architectural Responsibility Map

| Capability                | Primary Tier                        | Secondary Tier                | Rationale                                                                   |
| ------------------------- | ----------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| E2E package scaffold      | `apps/e2e` workspace                | root monorepo config          | The package is self-contained; root only wires up the Turbo task and script |
| Turbo task orchestration  | Root `turbo.json`                   | —                             | Turbo tasks are centrally defined at the repo root                          |
| Browser binary management | OS cache (`~/.cache/ms-playwright`) | `apps/e2e` install step       | Playwright installs browsers globally by version, not per-package           |
| TypeScript config         | `apps/e2e/tsconfig.json`            | —                             | Per-package; Playwright resolves tsconfig from the package root             |
| Test artifact storage     | `apps/e2e/test-results/`            | `apps/e2e/playwright-report/` | Standard Playwright defaults; gitignored                                    |

---

## Standard Stack

### Core

| Library            | Version  | Purpose         | Why Standard                                                             |
| ------------------ | -------- | --------------- | ------------------------------------------------------------------------ |
| `@playwright/test` | `1.60.0` | E2E test runner | Latest version satisfying the 14-day pnpm `minimumReleaseAge` constraint |

**Version justification:** [VERIFIED: npm registry]

- `1.61.1` published 2026-06-23 → 4 days old → **BLOCKED** by `minimumReleaseAge`
- `1.61.0` published 2026-06-15 → 12 days old → **BLOCKED** by `minimumReleaseAge`
- `1.60.0` published 2026-05-11 → 47 days old → **OK** ✓

**Installation (from `apps/e2e`):**

```bash
pnpm add -D @playwright/test@1.60.0
```

**Browser installation (after pnpm install):**

```bash
# From apps/e2e, or via filter from root:
pnpm --filter @packpixie/e2e exec playwright install --with-deps chromium
```

---

## Package Legitimacy Audit

| Package                   | Registry | Age      | Downloads | Source Repo                     | Verdict | Disposition                                      |
| ------------------------- | -------- | -------- | --------- | ------------------------------- | ------- | ------------------------------------------------ |
| `@playwright/test@1.60.0` | npm      | ~47 days | 41.4M/wk  | github.com/microsoft/playwright | OK      | Approved — but pin to 1.60.0 exactly (see below) |

**Packages removed due to [SLOP] verdict:** none

**Version-level constraint:** Although the package itself is `OK` (legitimate, Microsoft-owned, 41M weekly downloads), the two newest stable releases (1.61.0, 1.61.1) are flagged `SUS` by the package-legitimacy seam due to the `too-new` reason — which in this project maps directly to the hard `minimumReleaseAgeStrict: true` constraint in `pnpm-workspace.yaml`.

**Disposition:** Use `"@playwright/test": "1.60.0"` (exact, no `^`). This ensures pnpm resolves exactly this version and does not attempt to upgrade to a blocked newer release.

[VERIFIED: npm registry — `npm view @playwright/test time` queried 2026-06-27]

---

## Key Findings

### 1. Playwright + pnpm workspaces + ESM

**No structural conflict** between `"type": "module"` and Playwright.

Playwright uses its own TypeScript transpilation pipeline (esbuild-based) for all `.ts` source files — `playwright.config.ts`, test files, helpers. This pipeline is independent of Node.js's ESM module resolution. Whether or not `"type": "module"` is in `apps/e2e/package.json`, Playwright handles TypeScript internally.

- `playwright.config.ts` uses ESM `import`/`export` syntax and is loaded by Playwright's own loader — Node's module system does not apply here.
- Including `"type": "module"` is consistent with the repo convention (`apps/api` uses it) and is the right choice.
- pnpm workspace glob `apps/*` in `pnpm-workspace.yaml` already covers `apps/e2e` — **no change to `pnpm-workspace.yaml` is needed**. [VERIFIED: read pnpm-workspace.yaml in repo]

**One subtle ESM consideration:** Phase 2 will add `global-setup.ts` and `global-teardown.ts`. These are also TypeScript files loaded by Playwright's own transpiler, so `"type": "module"` in package.json does not affect them.

**The only real pnpm+ESM issue for this phase is the version constraint:**

> `minimumReleaseAge: 20160` + `minimumReleaseAgeStrict: true` in `pnpm-workspace.yaml` blocks any package published less than 14 days ago. Pin `@playwright/test@1.60.0`.

[VERIFIED: npm registry; CITED: pnpm-workspace.yaml in repo]

---

### 2. Turbo + Playwright integration

**Correct task configuration:**

```jsonc
// turbo.json — add to "tasks":
"e2e": {
  "dependsOn": ["^build"],
  "cache": false
}
```

- `"dependsOn": ["^build"]` — ensures `packages/model` (and any other dependency) is built before Playwright runs. This is the canonical pattern for tasks that consume compiled output from sibling packages. [CITED: turborepo.dev/repo/docs/reference/configuration]
- `"cache": false` — E2E tests exercise live browser state and runtime behavior. Caching test results would give false positives on subsequent runs. This is the correct approach. [CITED: turborepo.dev/repo/docs/reference/configuration — `dev` task example with `cache: false`]
- **Do NOT add `"persistent": true`** — `persistent` is for long-running watch/server processes that never exit. Playwright test runs exit when done. Adding `persistent: true` would prevent other tasks from depending on it and is semantically wrong. [CITED: turborepo.dev docs — "Label a task as persistent to prevent other tasks from depending on long-running processes"]
- **Do NOT add `"outputs": [...]`** — without `outputs`, Turbo caches nothing (except logs, which are cached when caching is enabled — but `cache: false` disables all of this). This is correct; Playwright artifacts should not be Turbo-cached.

**Turbo's behavior:** When `pnpm test:e2e` runs `turbo run e2e`, Turbo finds all workspace packages that have an `e2e` script. Only `apps/e2e` will have one. Turbo runs the dependency chain (`^build` means build all packages in the dep graph first), then invokes `pnpm exec playwright test` in `apps/e2e`.

---

### 3. playwright.config.ts structure

**Recommended complete configuration:**

```typescript
// apps/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Fail fast on CI if test.only was left in
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit workers on CI (avoids resource contention); full parallelism locally
  workers: process.env.CI ? 1 : undefined,

  // GitHub Actions annotations on CI; HTML report (opens on failure) locally
  reporter: process.env.CI
    ? 'github'
    : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

  // Artifact output dir (screenshots, traces, videos)
  outputDir: 'test-results',

  // Shared settings for all test projects
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',

    // Capture trace only on first retry (keeps artifact size manageable)
    trace: 'on-first-retry',

    // Capture screenshot only on failure
    screenshot: 'only-on-failure',

    // Capture video only on retry (Phase 2+ concern, but harmless to declare now)
    video: 'on-first-retry',
  },

  // Chromium only (D-01)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No globalSetup / globalTeardown — Phase 2 concern
});
```

Key config decisions:

- `testDir: './tests'` — relative to the config file, covers the empty `tests/` scaffold [CITED: playwright.dev/docs/test-configuration]
- `reporter: process.env.CI ? 'github' : [['html', ...]]` — `github` reporter produces GitHub Actions annotations; HTML opens on failure locally [CITED: playwright.dev/docs/test-reporters]
- `outputDir: 'test-results'` — Playwright default; add to `.gitignore`
- `playwright-report` — HTML reporter default output folder; add to `.gitignore`
- `baseURL: process.env.BASE_URL ?? 'http://localhost:5173'` — satisfies PW-02 and PW-03
- No `webServer` block — Phase 1 is scaffold only; no server is started

---

### 4. Browser installation in CI

**How browser binaries work:**

Playwright installs browser binaries to an OS-level cache directory, keyed by Playwright version:

- macOS: `~/Library/Caches/ms-playwright`
- Linux: `~/.cache/ms-playwright`

Binaries are **not** installed inside `node_modules` and are shared across any Playwright installation of the same version on the machine. [CITED: playwright.dev/docs/browsers]

**Installation command:**

```bash
# Standard (installs browser + system dependencies):
npx playwright install --with-deps chromium

# For CI-only headless (smaller download — installs chromium headless shell only):
npx playwright install --with-deps --only-shell
```

**In a pnpm monorepo:**

The `playwright` CLI is local to `apps/e2e/node_modules/.bin/`. Run installation from within the package or use the filter flag from the repo root:

```bash
# From repo root:
pnpm --filter @packpixie/e2e exec playwright install --with-deps chromium

# Or add a postinstall script to apps/e2e/package.json:
"postinstall": "playwright install --with-deps chromium"
```

**Recommendation:** Add `"postinstall": "playwright install --with-deps chromium"` to `apps/e2e/package.json`. This ensures `pnpm install` from the repo root automatically installs the browser. (Note: `postinstall` scripts are only run for packages listed in `onlyBuiltDependencies` or when heuristically detected — verify this works in the pnpm version in use, or rely on an explicit install step instead.)

**Alternative (safer for pnpm):** Add a `"install:browsers": "playwright install --with-deps chromium"` script to `apps/e2e/package.json` and document in README that devs must run `pnpm --filter @packpixie/e2e run install:browsers` after first clone.

**For CI caching (Phase 3 concern):**

```yaml
# Cache key: playwright version + OS
- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('apps/e2e/package.json') }}
```

[CITED: playwright.dev/docs/browsers]

---

### 5. TypeScript config for Playwright

**Playwright's tsconfig requirements are minimal:**

From the official docs: Playwright only reads these tsconfig options for its own transpiler:

- `allowJs`
- `baseUrl`
- `paths`
- `references`

Everything else (`strict`, `module`, `target`, `moduleResolution`, etc.) is **ignored by Playwright's transpiler** but still relevant for `tsc --noEmit` type-checking. [CITED: playwright.dev/docs/test-typescript]

**Recommended `apps/e2e/tsconfig.json`** (mirrors `apps/api/tsconfig.json`):

```jsonc
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
    "sourceMap": true,
  },
  "include": ["playwright.config.ts", "tests/**/*"],
  "exclude": ["node_modules", "test-results", "playwright-report"],
}
```

Notes:

- No `outDir` — Playwright doesn't compile to disk (it transpiles on-the-fly)
- No `rootDir` — not needed without `outDir`
- No `declaration` / `declarationMap` — not a publishable package
- `moduleResolution: "node"` — matches repo convention (`apps/api` uses it); consistent
- `include` covers `playwright.config.ts` and all test files
- `"module": "ESNext"` with `"moduleResolution": "node"` is the same combination used in apps/api; fine for the IDE and tsc, and Playwright ignores it anyway

**ESM + moduleResolution note:** There is no conflict between `"module": "ESNext"` and Playwright's runner. Playwright's transpiler converts TypeScript to JavaScript independently of the tsconfig module setting. Using `moduleResolution: "node"` (instead of `"node16"` or `"bundler"`) is intentional to match the existing repo convention.

[CITED: playwright.dev/docs/test-typescript, apps/api/tsconfig.json in repo]

---

## Recommended Approach

Implement in this exact order:

1. **Create `apps/e2e/package.json`** with name `@packpixie/e2e`, `"type": "module"`, `@playwright/test@1.60.0` as devDependency, scripts `{ "e2e": "playwright test" }`, and optionally a browser install helper script.

2. **Create `apps/e2e/tsconfig.json`** mirroring `apps/api/tsconfig.json` with the `include`/`exclude` adjusted for Playwright (no outDir, no declaration).

3. **Create `apps/e2e/playwright.config.ts`** using the full config snippet above.

4. **Create `apps/e2e/tests/.gitkeep`** to scaffold the empty tests directory.

5. **Create `apps/e2e/.gitignore`** with:

   ```
   node_modules/
   test-results/
   playwright-report/
   ```

6. **Update `turbo.json`** — add `"e2e": { "dependsOn": ["^build"], "cache": false }` to the `tasks` object.

7. **Update root `package.json`** — add `"test:e2e": "turbo run e2e"` to `scripts`.

8. **Run `pnpm install`** from repo root — pnpm picks up `apps/e2e` via the existing `apps/*` glob.

9. **Install browsers** — `pnpm --filter @packpixie/e2e exec playwright install --with-deps chromium`

10. **Verify** — `pnpm test:e2e` should exit with "no tests found" (exit code 0 or Playwright's specific "no tests" exit), not a configuration error.

---

## Pitfalls to Avoid

### Pitfall 1: Newest Playwright blocked by `minimumReleaseAge`

**What goes wrong:** `pnpm install` fails with a "package too new" error if you specify `@playwright/test@latest`, `^1.61.0`, or any range that resolves to a version published less than 14 days ago.
**Root cause:** `pnpm-workspace.yaml` has `minimumReleaseAge: 20160` (14 days) with `minimumReleaseAgeStrict: true`. As of 2026-06-27, both 1.61.1 (4 days old) and 1.61.0 (12 days old) are blocked.
**Prevention:** Pin `"@playwright/test": "1.60.0"` exactly (no `^`).
**Warning sign:** pnpm install exits with an error mentioning release age or the version number.

### Pitfall 2: `persistent: true` on the e2e task

**What goes wrong:** If `persistent: true` is added to the `e2e` Turbo task, Turbo treats it as a long-running process. Other tasks cannot depend on it, and Turbo may not run it correctly in `turbo run e2e`.
**Root cause:** `persistent` is for `dev` servers and watchers — processes that never exit. Playwright exits on completion.
**Prevention:** Never add `persistent: true` to the `e2e` task. Only `cache: false`.

### Pitfall 3: Not pinning the exact version causing future pnpm upgrades to break

**What goes wrong:** Using `^1.60.0` allows pnpm to resolve to 1.61.x once those versions age out of the minimumReleaseAge window, which is fine — but `^1.60.0` could also resolve to 1.60.0 consistently. The risk is using `latest` or no version constraint.
**Prevention:** Use `"1.60.0"` (exact) to be unambiguous. The planner can choose `^1.60.0` as an alternative, understanding that pnpm will resolve it to 1.60.0 today and potentially upgrade later.

### Pitfall 4: Forgetting `playwright install` after `pnpm install`

**What goes wrong:** `pnpm test:e2e` fails with "browser not found" or "chromium executable not found" because browser binaries aren't in `node_modules` — they're in the OS cache and require a separate install step.
**Prevention:** Document the install step clearly. Consider adding `"install:browsers": "playwright install --with-deps chromium"` script to `apps/e2e/package.json`.

### Pitfall 5: `apps/e2e` running `playwright test` against wrong CWD

**What goes wrong:** If Playwright can't find `playwright.config.ts`, it falls back to defaults and may look for tests in the wrong directory, producing a config error instead of "no tests found".
**Prevention:** The `"e2e": "playwright test"` script in `apps/e2e/package.json` runs with CWD at `apps/e2e/`, so Playwright resolves `playwright.config.ts` from there. Ensure the config file is at `apps/e2e/playwright.config.ts` (not inside `src/`).

---

## Environment Availability

| Dependency              | Required By       | Available             | Version | Notes                                                          |
| ----------------------- | ----------------- | --------------------- | ------- | -------------------------------------------------------------- |
| pnpm                    | Package install   | ✓                     | 10.12.1 | Confirmed from packageManager field                            |
| turbo                   | Task runner       | ✓                     | ^2.5.6  | In root devDependencies                                        |
| Node.js                 | Playwright runner | ✓                     | —       | Playwright 1.60.0 requires Node 18+                            |
| Chromium browser binary | PW-01–05          | ✗ (not yet installed) | —       | Installed via `playwright install chromium` after pnpm install |

---

## Security Domain

This phase creates no server endpoints, handles no user input, and makes no network calls. The security surface is limited to:

| ASVS Category       | Applies | Note                                          |
| ------------------- | ------- | --------------------------------------------- |
| V5 Input Validation | No      | No user input in this phase                   |
| V6 Cryptography     | No      | No crypto in this phase                       |
| Supply Chain        | Yes     | Package legitimacy verified — see audit above |

The `minimumReleaseAge: 20160` constraint in `pnpm-workspace.yaml` is itself a supply-chain security measure (reduces risk from packages published and immediately compromised). Pinning 1.60.0 is consistent with this policy.

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: npm registry] — `npm view @playwright/test time` — version publish dates for 1.60.0, 1.61.0, 1.61.1
- [CITED: playwright.dev/docs/test-typescript] — Playwright only reads `allowJs`, `baseUrl`, `paths`, `references` from tsconfig
- [CITED: playwright.dev/docs/test-reporters] — `github` reporter for CI, HTML reporter for local
- [CITED: playwright.dev/docs/test-configuration] — `defineConfig` structure, baseURL, outputDir, retries, workers, projects
- [CITED: playwright.dev/docs/browsers] — browser binary cache location, `install --with-deps --only-shell`
- [CITED: turborepo.dev/repo/docs/reference/configuration] — `cache: false`, `persistent`, `dependsOn: ["^build"]`

### Secondary (MEDIUM confidence)

- [CITED: apps/api/tsconfig.json in repo] — tsconfig conventions to mirror
- [CITED: pnpm-workspace.yaml in repo] — `minimumReleaseAge: 20160`, `minimumReleaseAgeStrict: true`

---

## Assumptions Log

| #   | Claim                                                                                                  | Section   | Risk if Wrong                                                                           |
| --- | ------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------- |
| A1  | `"type": "module"` in `apps/e2e/package.json` does not conflict with Playwright 1.60.0's config loader | Finding 1 | Low — Playwright has its own TypeScript transpiler; if wrong, remove `"type": "module"` |
| A2  | `postinstall` scripts in workspace packages run automatically during `pnpm install` from root          | Finding 4 | Medium — if pnpm doesn't run it, devs need a manual step                                |
| A3  | `@playwright/test@1.60.0` has full ESM support in TypeScript config files                              | Finding 3 | Low — ESM import syntax in .ts files is handled by Playwright's transformer, not Node   |

---

## Open Questions

1. **Does pnpm run `postinstall` for workspace packages by default?**
   - What we know: pnpm-workspace.yaml has `onlyBuiltDependencies: [esbuild]` which restricts auto-run of lifecycle scripts to esbuild only
   - What's unclear: whether `postinstall` in `apps/e2e/package.json` would be auto-run by `pnpm install`
   - Recommendation: Do NOT rely on `postinstall`. Instead, add `"install:browsers"` script to `apps/e2e/package.json` and document the manual step. The planner should add a verification step ensuring the browser install command is clearly communicated.

2. **Should `pnpm test:e2e` exit code 0 or non-zero on "no tests found"?**
   - What we know: Playwright exits with code 0 when no tests are found (it's not an error state)
   - The UAT criteria says "exits with 'no tests found' rather than a config error" — this is satisfied by exit code 0 + the message in stdout
   - Recommendation: The verification task should run `pnpm test:e2e` and check for the "no tests found" string in output, not just exit code

---

## RESEARCH COMPLETE

**Phase:** 1 — Playwright Package Foundation
**Confidence:** HIGH

### Key Findings

- `@playwright/test@1.60.0` is the newest usable version given the 14-day `minimumReleaseAge` constraint (1.61.0 and 1.61.1 are blocked). This must be pinned exactly.
- The Turbo `e2e` task is `{ "dependsOn": ["^build"], "cache": false }` with no `persistent: true`.
- `playwright.config.ts` uses `process.env.CI ? 'github' : [['html', { open: 'on-failure' }]]` for reporters, satisfying PW-05.
- Browser binaries install to the OS cache, not `node_modules` — a separate `playwright install chromium` step is required.
- Playwright's TypeScript transpiler ignores all tsconfig options except `allowJs`, `baseUrl`, `paths`, `references` — mirror `apps/api/tsconfig.json` for IDE support, and it will work correctly.
- `"type": "module"` in `apps/e2e/package.json` is compatible with Playwright 1.60.0.
- `pnpm-workspace.yaml` already covers `apps/e2e` via `apps/*` — no change needed.

### File Created

`.planning/phases/01-playwright-package-foundation/01-RESEARCH.md`

### Confidence Assessment

| Area                 | Level | Reason                                                              |
| -------------------- | ----- | ------------------------------------------------------------------- |
| Version constraint   | HIGH  | Verified via `npm view @playwright/test time` + pnpm-workspace.yaml |
| Turbo task config    | HIGH  | Cited from official turborepo.dev docs                              |
| playwright.config.ts | HIGH  | Cited from official playwright.dev docs                             |
| Browser install      | HIGH  | Cited from official playwright.dev/docs/browsers                    |
| TypeScript config    | HIGH  | Cited from official playwright.dev/docs/test-typescript             |

### Ready for Planning

Research complete. Planner can now create PLAN.md files for Phase 1.
