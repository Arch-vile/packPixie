# Testing Patterns

**Analysis Date:** 2026-06-27

## Test Framework

**Runner:**
- None installed. No test framework exists in any package.
- No `jest.config.*`, `vitest.config.*`, or equivalent configuration found anywhere in the repository.

**Assertion Library:**
- None.

**Run Commands:**
```bash
# API (apps/api/package.json):
pnpm test   # Prints "Error: no test specified" and exits with code 1

# Client (apps/client/package.json):
# No test script defined at all

# Model (packages/model):
# No test script defined
```

## Test File Organization

**Location:**
- No test files exist anywhere in the repository.
- No `__tests__/` directories, no `*.test.ts`, `*.spec.ts`, `*.test.tsx`, or `*.spec.tsx` files found.

**Naming:**
- No naming convention established — no precedent exists.

**Structure:**
- None established.

## Test Structure

**No tests exist.** The entire testing layer is absent. The following is the recommended structure based on the existing codebase conventions:

**Recommended suite organization for API:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('checkDynamoDB', () => {
  it('returns disconnected when table name is not configured', async () => {
    // ...
  });
  it('returns connected when DynamoDB responds', async () => {
    // ...
  });
});
```

**Recommended suite organization for React components:**
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusChecker from './StatusChecker';

describe('StatusChecker', () => {
  it('renders check button', () => {
    render(<StatusChecker />);
    expect(screen.getByText('Check API Status')).toBeInTheDocument();
  });
});
```

## Mocking

**Framework:**
- None installed. No mocking infrastructure exists.

**What would need mocking in tests:**
- `DynamoDBDocumentClient` and all command sends (`QueryCommand`, `PutCommand`, `TransactWriteCommand`, `BatchWriteCommand`) in `apps/api/src/routes/api.ts`
- `CognitoJwtVerifier.verify()` in `apps/api/src/plugins/auth.ts`
- `fetch` calls in `apps/client/src/api/api.ts`
- `fetchAuthSession()` from `aws-amplify/auth` in `apps/client/src/api/api.ts`
- `import.meta.env` values in `apps/client/src/config.ts`

## Fixtures and Factories

**Test Data:**
- None exist.

**Recommended location for future fixtures:**
- API: `apps/api/src/__tests__/fixtures/`
- Client: `apps/client/src/__tests__/fixtures/`

## Coverage

**Requirements:**
- None enforced. No coverage configuration or thresholds defined.

**Coverage command:**
- Not available — no test runner installed.

## Test Types

**Unit Tests:**
- None exist. High-value targets for unit tests would be:
  - `checkDynamoDB()` in `apps/api/src/routes/api.ts` (pure async function with clear inputs/outputs)
  - `config()` builder in `apps/api/src/config.ts` (throws on missing values)
  - `createDynamoDBClient()` in `apps/api/src/lib/dynamodb.ts`
  - Email validation/normalization logic in `apps/api/src/routes/api.ts` (`.trim().toLowerCase()` and dedup)
  - `requireEnv()` in `apps/client/src/config.ts`

**Integration Tests:**
- None exist. High-value targets:
  - Full Fastify route tests using `fastify.inject()` for `/api/status`, `/api/trips`, `/api/comments`
  - Auth middleware behavior (missing header, invalid token, valid token)

**E2E Tests:**
- Not used. No Playwright, Cypress, or similar framework installed.

## Common Patterns

**Async Testing (recommended):**
```typescript
it('handles DynamoDB errors', async () => {
  const mockClient = { send: vi.fn().mockRejectedValue(new Error('table not found')) };
  const result = await checkDynamoDB(conf, mockClient as unknown as DynamoDBDocumentClient);
  expect(result.status).toBe('error');
  expect(result.message).toBe('table not found');
});
```

**Error Testing (recommended):**
```typescript
it('throws when table name missing', () => {
  expect(() => config().build()).toThrow('DynamoDB table name is required');
});
```

## Summary of Testing Gap

The project has **zero test coverage**. All packages carry placeholder or absent test scripts:

| Package | Test Script | Test Files |
|---------|-------------|------------|
| `apps/api` | `echo "Error: no test specified" && exit 1` | None |
| `apps/client` | Not defined | None |
| `packages/model` | Not defined | None |

**Recommended first steps to add testing:**
1. Install `vitest` as dev dependency in `apps/api` and `apps/client`
2. Add `"test": "vitest"` scripts to both `package.json` files
3. Install `@testing-library/react` and `@testing-library/jest-dom` for `apps/client`
4. Write unit tests for `config()` builder and `checkDynamoDB()` in the API as initial coverage
5. Write route-level integration tests using `fastify.inject()` for the public `/api/status` endpoint

---

*Testing analysis: 2026-06-27*
