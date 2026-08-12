---
phase: 5
slug: shared-item-model-comments-cleanup
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None dedicated — this is a types-and-deletion phase; the TypeScript compiler + monorepo build are the validators (no unit-test runner in `packages/model`, build script is `tsc` only) |
| **Config file** | `turbo.json` (task graph); `packages/model/tsconfig.json` |
| **Quick run command** | `pnpm type-check` |
| **Full suite command** | `pnpm build && pnpm type-check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm type-check`
- **After every plan wave:** Run `pnpm build && pnpm type-check`
- **Before `/gsd-verify-work`:** `pnpm build` green + grep gate empty (`dist` excluded, or after a clean rebuild)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | MODEL-01 | — | N/A (type declarations only) | compile / type-check | `pnpm build && pnpm type-check` | ✅ (toolchain) | ⬜ pending |
| 5-02-01 | 02 | 2 | MODEL-02 | — | Attack surface reduced (removes two protected endpoints) | compile / build | `pnpm build && pnpm type-check` | ✅ (toolchain) | ⬜ pending |
| 5-02-02 | 02 | 2 | MODEL-02 | — | No orphaned client callers left | grep gate | `grep -rni comment apps packages --include='*.ts' --include='*.tsx' \| grep -v node_modules \| grep -v /dist/` returns empty | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

- No test-runner scaffolding required. The TypeScript compiler and `pnpm build` are the natural, sufficient validators for a types-and-deletion phase; introducing jest/vitest solely to assert type shapes would be over-engineering. The existing Playwright e2e suite is untouched by this phase.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

- MODEL-01 (types exist, compile, importable) and MODEL-02 (Comments removed, no dangling references, build green) are all provable by `pnpm build && pnpm type-check` plus the `comment` grep gate.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (none required)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
