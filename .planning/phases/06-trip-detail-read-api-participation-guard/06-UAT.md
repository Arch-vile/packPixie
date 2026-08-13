---
status: testing
phase: 06-trip-detail-read-api-participation-guard
source: [06-VERIFICATION.md]
started: 2026-08-13T17:15:06.722Z
updated: 2026-08-13T17:15:06.722Z
---

## Current Test

number: 1
name: M1 — foreign trip (non-member receives 404)
expected: |
  Authenticated user A requests a trip they are NOT a USER# of.
  Expect: HTTP 404 with body exactly {"error":"Trip not found"}.
awaiting: user response

## Tests

### 1. M1 — foreign trip (non-member receives 404)
expected: Authenticated user A requests a trip they are NOT a USER# of → HTTP 404 with body exactly {"error":"Trip not found"}.
result: [pending]

### 2. M2 — non-existent trip (enumeration resistance)
expected: The same user requests a random UUID → capture status, body, AND headers and diff against M1; they MUST be byte-identical (foreign and non-existent trips indistinguishable).
result: [pending]

### 3. M3 — member reads own trip (shaped 200, no key leakage)
expected: The trip creator requests their own trip → HTTP 200 with { tripId, tripName, participants, items }, items: [], and NO PK/SK/GSI1PK/GSI1SK anywhere in the payload.
result: [pending]

### 4. M4 — case-insensitive membership
expected: A member whose JWT email contains uppercase letters requests their own trip → HTTP 200 (not a false 404), proving the lowercasing guard.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
