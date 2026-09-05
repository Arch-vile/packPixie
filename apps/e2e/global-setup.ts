import type { FullConfig } from '@playwright/test';

import { createTestDynamoDBClient, createTable } from './src/db/init';
import { loginAndSaveState } from './src/auth/login';

// DynamoDB Local itself is started by start-dynamodb-local.sh, which runs
// before Playwright's webServer processes (the API and Vite dev server) —
// this hook only runs after webServer is already up, too late for the API's
// own startup DynamoDB connectivity check to have anything to connect to.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Step 1: Create DynamoDB table with production schema
  //
  // -sharedDb (passed to DynamoDB Local in start-dynamodb-local.sh) keeps it as
  // ONE database. Without it, the instance silently partitions storage into a
  // separate hidden database per (AWS access key ID + region). Both clients
  // pin the same fake identity — the test harness via { accessKeyId: 'local' }
  // (src/db/init.ts), and the API the same whenever LOCAL_DYNAMODB_URL is set
  // (apps/api/src/lib/dynamodb.ts) — so they already share a namespace;
  // -sharedDb guarantees it regardless of any future credential/region drift.
  // Full write-up in README.md → Troubleshooting → "Cannot do operations on a
  // non-existent table".
  const dbClient = createTestDynamoDBClient();
  await createTable(dbClient);

  // Step 2: Browser UI login — saves session to .auth/user.json
  await loginAndSaveState();
}
