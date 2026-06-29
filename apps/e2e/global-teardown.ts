import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { FullConfig } from '@playwright/test';

import { createTestDynamoDBClient, deleteTable } from './src/db/init';

const STATE_FILE = join(import.meta.dirname, '.e2e-state.json');

export default async function globalTeardown(
  _config: FullConfig,
): Promise<void> {
  // Step 1: Delete the DynamoDB table (DB-03, D-12)
  // deleteTable swallows ResourceNotFoundException — safe even if setup failed mid-way
  try {
    const dbClient = createTestDynamoDBClient();
    await deleteTable(dbClient);
  } catch (err) {
    // Log but do not rethrow — a throwing teardown masks actual test failures
    console.error('[teardown] Failed to delete DynamoDB table:', err);
  }

  // Step 2: Remove container state file
  try {
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
  } catch {
    // Non-fatal
  }

  // Container cleanup is handled automatically by the Ryuk reaper on process exit (D-13)
}
