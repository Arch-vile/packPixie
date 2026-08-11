import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { FullConfig } from '@playwright/test';

import { createTestDynamoDBClient, deleteTable } from './src/db/init';

const AUTH_FILE = join(import.meta.dirname, '.auth', 'user.json');

export default async function globalTeardown(
  _config: FullConfig,
): Promise<void> {
  // Step 1: Delete the DynamoDB table
  // deleteTable swallows ResourceNotFoundException — safe even if setup failed mid-way
  try {
    const dbClient = createTestDynamoDBClient();
    await deleteTable(dbClient);
  } catch (err) {
    // Log but do not rethrow — a throwing teardown masks actual test failures
    console.error('[teardown] Failed to delete DynamoDB table:', err);
  }

  // Step 2: Remove auth state — Cognito tokens expire after ~1h; always regenerate on next run
  try {
    if (existsSync(AUTH_FILE)) {
      unlinkSync(AUTH_FILE);
    }
  } catch {
    // Non-fatal
  }

  // Container cleanup is handled automatically by the Ryuk reaper on process exit
}
