---
created: 2026-09-04T15:10:00.000Z
title: "turbo.json has no `test` task — `pnpm test` fails repo-wide"
area: infra
severity: warning
source: [07-01-SUMMARY.md]
files:
  - turbo.json
  - apps/api/package.json
---

## Problem

`pnpm test` (root) runs `turbo run test`, but `turbo.json`'s `tasks` map has no
`test` entry, so Turbo exits immediately with `Missing tasks in project: Could
not find task 'test' in project` — before it even looks at which packages
define a `test` script. This is a pre-existing gap (turbo.json has never
defined a `test` task) surfaced by Phase 07's post-merge test gate; it is not
caused by any Phase 07 change. `apps/api` is the only package with a `test`
script today (`tsx --test src/lib/*.test.ts`), and running it directly via
`pnpm --filter api test` passes (40/40).

CLAUDE.md documents `pnpm test` as the way to "Run all tests," so the broken
root command is a real gap, not just cosmetic.

## Solution

Add a `test` task to `turbo.json` (e.g. `{ "dependsOn": ["^build"], "outputs": [] }`,
mirroring `type-check`), so `turbo run test` fans out to packages that define a
`test` script and no-ops for those that don't. Verify `pnpm test` then runs
`apps/api`'s suite and exits 0 with no `test` script defined elsewhere.
