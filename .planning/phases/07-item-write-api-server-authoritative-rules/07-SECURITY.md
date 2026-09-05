---
phase: 07
slug: item-write-api-server-authoritative-rules
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-05
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client -> API | Untrusted bearer token, `tripId`/`itemId` path params, and the full create/patch request body cross here; the token is verified by `authPlugin`, everything else is untrusted input | Auth token, item field values, path identifiers |
| API -> DynamoDB | `tripId`/`itemId` flow into parameterized `Query`/`Update`/`Delete`/`Put` key values; attribute names/values in `UpdateExpression` are built from a fixed, server-controlled key list, never from raw client field names | Item attributes, key values |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-7-01 | Elevation of Privilege (IDOR) | POST/PATCH/DELETE item handlers | high | mitigate | `isTripMember` guard identical to Phase 6 — 404 unless caller's `USER#<email>` record present; `tripId`/`itemId` never trusted for authorization (`api.ts` all three handlers) | closed |
| T-7-02 | Information Disclosure (enumeration) | 404 response paths | high | mitigate | Non-member and unknown-tripId return byte-identical `404 { error: 'Trip not found' }`; unknown-itemId returns distinct-but-still-404 `{ error: 'Item not found' }` — verified live in this session's UAT (M9, both sub-cases) | closed |
| T-7-03 | Tampering (invalid state transition) | `computeItemPatch` / `buildCreateItemAttributes` | high | mitigate | `Status: 'packed'` rejected whenever resulting `PackedBy` is unset, computed from the resulting field set before write — holds for create, patch, and packedBy-clear+status-set same-request case. Additionally hardened this session: a second write-time `ConditionExpression` (`requiresStatusNotPacked`) closes a reverse-direction TOCTOU race this threat's original mitigation didn't cover (commit `7729448`), verified via a live concurrent-request harness (0/10 violations post-fix vs 2/5 before) | closed |
| T-7-04 | Spoofing (PackedBy impersonation / mass assignment) | `validatePackedByParticipant`, `findUnknownFields` | high | mitigate | `PackedBy` must resolve to a real `USER#` participant email; any request-body field outside the fixed writable-field allowlist is rejected 400 — verified live in this session's UAT (M2, M4) | closed |
| T-7-05 | Tampering (DynamoDB upsert / phantom row) | PATCH `UpdateCommand` | medium | mitigate | `ConditionExpression: attribute_exists(PK)` on every `UpdateCommand` turns default upsert-on-missing-key into a `ConditionalCheckFailedException`, mapped to 404 — verified live in this session's UAT (M9b) | closed |
| T-7-06 | Tampering (expression injection) | `buildUpdateExpression` | medium | mitigate | Attribute names/values never string-concatenated — every name/value aliased (`#s0`, `:v0`, ...) via `ExpressionAttributeNames`/`ExpressionAttributeValues`, sourced only from the fixed `ITEM_WRITABLE_FIELDS` set; confirmed by direct code read (`tripDetail.ts:386-424`) and unit test | closed |
| T-7-07 | Repudiation (unrecoverable delete) | DELETE handler | medium | accept | Hard delete with no tombstone is a deliberate, already-locked product decision (D-08 in `07-01-PLAN.md`); accepted risk, not mitigated with soft-delete machinery this phase | closed (accepted) |
| T-7-SC | Tampering (supply chain) | npm installs | low | accept | No new packages installed this phase — new unit tests run through `tsx`, already an existing `apps/api` devDependency | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-7-07 | Hard delete with no tombstone/undo is a locked product decision (D-08) — packing-list items are low-value, frequently re-added, and the product spec explicitly rejects soft-delete complexity for this milestone | Product owner (via 07-01-PLAN.md D-08) | 2026-09-04 |
| AR-07-02 | T-7-SC | No new npm packages introduced this phase; test runner (`tsx`) already an existing devDependency | Developer | 2026-09-04 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-05 | 8 | 8 | 0 | Claude (gsd-secure-phase, register authored at plan time, ASVS L1 grep-depth verification against `07-VERIFICATION.md` code-reading evidence + this session's live UAT + the T-7-03 counterpart fix) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-05
