---
phase: 6
slug: trip-detail-read-api-participation-guard
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None for `apps/api` — the `apps/api` test script is a stub (`"test": "echo ... && exit 1"`); no vitest/jest config exists anywhere in the repo. **Do not scaffold one** (E2E for this endpoint is deferred to Phase 10). |
| **Config file** | none — API behavioral coverage is manual this phase (Playwright E2E lives in `apps/e2e`, out of scope) |
| **Quick run command** | `pnpm type-check` |
| **Full suite command** | `pnpm build && pnpm lint && pnpm type-check` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm type-check`
- **After every plan wave:** Run `pnpm build && pnpm lint && pnpm type-check`
- **Before `/gsd-verify-work`:** Full build green **and** the M1–M4 manual guard matrix executed and recorded
- **Max feedback latency:** ~60 seconds (type-check)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-xx | 01 | 1 | TRIP-02 | T-6-01 (IDOR) | Non-member → 404 `{ error: 'Trip not found' }`; foreign vs non-existent byte-identical | manual (Phase 10 E2E) + code review | `pnpm type-check` | ✅ | ⬜ pending |
| 6-01-xx | 01 | 1 | TRIP-02 / SC#1 | T-6-02 (info-disclosure) | No `PK`/`SK`/`GSI*` in 200 body; single `Query`, no second read | code review + manual M3 | `pnpm type-check` (DTO type forbids internal keys) | ✅ | ⬜ pending |
| 6-01-xx | 01 | 1 | TRIP-03 | — | Membership / `PackedBy` / default-view key off `request.user.email.trim().toLowerCase()` | code review + manual M4 | `pnpm type-check` | ✅ | ⬜ pending |
| 6-02-xx | 02 | 1 | SC#3 | — | Docs corrected: no surviving membership/`PackedBy` `<UserId>` identity ref | doc review | `grep` for surviving `<UserId>` membership refs | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Exact task IDs are assigned by the planner; the rows above map each phase requirement/success-criterion to its verification method.)*

---

## Wave 0 Requirements

- [ ] None — **do not scaffold a unit-test framework** for `apps/api` (contradicts deferred scope; Phase 10 owns E2E for this endpoint).

*Existing infrastructure (type-check + build + lint) covers all automated verification available this phase.*

---

## Manual-Only Verifications

The security-critical guard has no automated behavioral test until Phase 10, so the planner MUST encode this matrix as explicit UAT/verification steps.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| M1 — foreign trip → 404 | TRIP-02 | No API unit harness; E2E deferred to Phase 10 | Authenticated user A requests a trip they are **not** a `USER#` of → expect `404` and body exactly `{"error":"Trip not found"}` |
| M2 — non-existent trip → identical 404 | TRIP-02 | Enumeration resistance can only be proven by comparing two live responses | Same user requests a random UUID → capture status, body, and headers; **diff against M1** — must be byte-identical |
| M3 — member → 200 shaped snapshot | TRIP-02 / SC#1 | Verifies DTO shaping and no internal-key leakage end-to-end | Trip creator requests own trip → expect `200` with `{ tripId, tripName, participants, items }`, `items: []`, and **no** `PK`/`SK`/`GSI1PK`/`GSI1SK` anywhere in the payload |
| M4 — case-insensitive membership | TRIP-03 | Proves the lowercasing guard against a real mixed-case JWT | Member whose JWT email has uppercase letters → expect `200` (not a false 404) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (type-check/build/lint) or a recorded manual matrix entry
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (N/A — none)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] M1–M4 manual matrix executed and recorded before `/gsd-verify-work`
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
