---
phase: 8
slug: trip-detail-inline-edit-table-ui
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-06
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None detected in `apps/client` — no `vitest`/`jest` config, no `*.test.*`/`*.spec.*` files. `apps/api` has ad hoc `*.test.ts` files but no client-side unit test runner exists at all. `apps/e2e` (Playwright) exists but is explicitly out of scope this phase (Phase 10). |
| **Config file** | none — see Wave 0 Requirements |
| **Quick run command** | `pnpm --filter client type-check` / `pnpm --filter client lint` (only automated gates available for this package) |
| **Full suite command** | `pnpm build` (root) — catches TypeScript/bundling breaks monorepo-wide; `pnpm test` is currently a no-op for `apps/client` (no `"test"` script) |
| **Estimated runtime** | ~30-60 seconds (type-check + lint + build) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter client type-check` and `pnpm --filter client lint`
- **After every plan wave:** Run `pnpm build` (root)
- **Before `/gsd-verify-work`:** Full suite (type-check + lint + build) must be green; conversational UAT against the four ROADMAP success criteria (TRIP-01, ITEM-01, ITEM-02, ITEM-03) since no automated behavioral test exists
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | TRIP-01 | V4 Access Control | Client treats any non-2xx trip-detail fetch as "Trip not found." — never distinguishes member-vs-nonexistent | manual-only | — | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | ITEM-01 | — | New row's `packedBy` sourced from verified `userEmail` prop, not client-editable at creation | manual-only | — | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | ITEM-02 | V5 Input Validation | D-07 blank-name guard is a client UX nicety only; server remains authoritative validator | manual-only | — | ❌ W0 | ⬜ pending |
| 08-01-04 | 01 | 1 | ITEM-03 | — | Optimistic UI rollback restores last known-good *server* value, not just "undo the keystroke" | manual-only | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No client-side test framework exists (`vitest`/`@testing-library/react` not installed). Standing one up is **not recommended** for this phase — see justification below. Flagged here only so the planner/executor does not silently assume automated coverage exists.

*Existing infrastructure (type-check, lint, build) covers automated verification for this phase; behavioral coverage is manual-only by design (see below).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Navigate to `/trips/:tripId` and see the loaded packing table | TRIP-01 | No client test framework exists; Phase 10 will add E2E coverage of this exact path (E2E-01/E2E-02) — standing up unit-test infra now would duplicate that effort | Sign in, open a trip from the trip list, confirm the packing table renders with trip meta + participants + items from a single `GET /trips/:tripId` call (Network tab) |
| Add an item row defaulting `PackedBy` = current user, `Status` = unset | ITEM-01 | Same as above | Click "+ Add item", confirm a new row appears with `PackedBy` pre-set to the signed-in user's email and `Status` unset |
| Inline-edit any field (Name, Quantity, Weight, PackedBy, Status, Category, Consumable) and persist the change | ITEM-02 | Same as above | Edit each field type once, reload the page, confirm the edited value survived; verify blank Name blocks save with red-outline flag (D-07); verify Weight empty-string clears to `null` distinct from typed `0` (D-06) |
| Delete a row after confirming a dialog (hard delete, no undo) | ITEM-03 | Same as above | Click delete on a non-packed row, confirm the native `confirm()` dialog, verify the row disappears and does not reappear on reload; verify delete control is disabled on a `packed` row |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — this phase's tasks are manual-only by design (see Wave 0 Requirements justification)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — N/A, automated gates (type-check/lint/build) run after every task
- [x] Wave 0 covers all MISSING references — no test framework install recommended (see justification)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter — left `false`; this phase is intentionally manual-only (no behavioral automated tests), by design per research recommendation, not a gap needing closure

**Approval:** pending
