# Phase 8: Trip-Detail Inline-Edit Table (UI) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-06
**Phase:** 8-Trip-Detail Inline-Edit Table (UI)
**Areas discussed:** Inline-edit interaction model, Field input widgets & validation

---

## Inline-edit interaction model

| Option | Description | Selected |
|--------|-------------|----------|
| Always-editable inputs | Every cell already a live input/select, no view/edit mode toggle | ✓ |
| Click-to-edit per cell | Cells are plain text until clicked, then swap to an input | |

**User's choice:** Always-editable inputs
**Notes:** Recommended default confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-save per field on blur/change | Each field fires its own PATCH independently; Phase 7's PATCH accepts partial bodies | ✓ |
| Per-row explicit Save button | Edit multiple fields, one Save sends a single PATCH for the row | |

**User's choice:** Auto-save per field on blur/change
**Notes:** Recommended default confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic update, reconcile on response | Cell shows new value instantly; reconciles or rolls back on the PATCH response | ✓ |
| Wait for server response | Cell shows pending/disabled state until the PATCH resolves | |

**User's choice:** Optimistic update, reconcile on response
**Notes:** Recommended default confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Native tab order only | Standard browser Tab/Shift+Tab; Enter blurs the current input | ✓ |
| Custom grid navigation | Spreadsheet-like arrow-key movement between cells | |

**User's choice:** Native tab order only
**Notes:** Recommended default confirmed.

---

## Field input widgets & validation

**Note:** Consumable was decided outright (single-option — checkbox is the direct fit for a boolean field, no genuine alternative) rather than asked as a question.

| Option | Description | Selected |
|--------|-------------|----------|
| Native `<select>` dropdowns | Status: to-buy/found/packed/unset; PackedBy: participant list + unassigned | ✓ |
| Free-text input with client-side validation | Plain text validated against the allowed set before saving | |

**User's choice:** Native `<select>` dropdowns
**Notes:** Recommended default confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Empty string in a number input = unset | Blank Weight sends `null`; typed `0` sends the number `0` | ✓ |
| Separate "no weight" checkbox/toggle | Explicit toggle disables the number input when off | |

**User's choice:** Empty string in a number input = unset
**Notes:** Recommended default confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Block empty Name client-side | Disable/skip auto-save when Name is trimmed-empty; visually flag the field | ✓ |
| Allow empty Name to save | Let a blank name through | |

**User's choice:** Block empty Name client-side
**Notes:** Recommended default confirmed.

---

## Claude's Discretion

Two gray areas were surfaced during `present_gray_areas` but not selected for discussion:

- **Conflict handling (409)** — how the UI responds to Phase 7's 409 conflict responses (roll back, error display, refresh affordance).
- **Add-row & delete UX** — where "add item" lives, and the delete confirmation dialog style / packed-item delete-disable behavior.

Both are in-scope for Phase 8 (not deferred to another phase) — resolved as Claude's Discretion in CONTEXT.md, with guidance derived from the decisions above and prior-phase context (Phase 7 D-09, Phase 6 D-02).

Also left to the planner: exact trip-list → trip-detail navigation affordance in `TripList.tsx`, and the UI treatment for a 404 (non-member/unknown trip) on the trip-detail fetch.

## Deferred Ideas

- `PackedBy = me` default view, Status filter, show-all toggle → Phase 9 (VIEW-01/02/03).
- E2E coverage of the item table → Phase 10 (E2E-01/02).
- Reviewed but not folded: pagination-guard todo (2026-08-13) and Fastify schema-validation todo (2026-09-04) — both backend hardening, not UI concerns.
