import { GenericContainer } from 'testcontainers';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { FullConfig } from '@playwright/test';

import { createTestDynamoDBClient, createTable } from './src/db/init';
import { seedTestData } from './src/db/seed';
import { loginAndSaveState } from './src/auth/login';

const STATE_FILE = join(import.meta.dirname, '.e2e-state.json');

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Step 1: Start DynamoDB Local container on fixed host port 8000 (D-01, D-02)
  // withExposedPorts object syntax { container: N, host: N } forces a specific host port
  const container = await new GenericContainer('amazon/dynamodb-local')
    .withExposedPorts({ container: 8000, host: 8000 })
    .start();

  // Step 2: Persist container ID so globalTeardown can reference it if needed
  // (Ryuk reaper handles actual cleanup on process exit — this is belt-and-suspenders)
  writeFileSync(STATE_FILE, JSON.stringify({ containerId: container.getId() }));

  // Step 3: Create DynamoDB table with production schema (D-11, DB-01)
  const dbClient = createTestDynamoDBClient();
  await createTable(dbClient);

  // Step 4: Seed minimum test data (DB-02)
  await seedTestData(dbClient);

  // Step 5: Browser UI login — Vite is already up (webServer started it before globalSetup)
  // Saves authenticated session to .auth/user.json (D-07, D-08, AUTH-02, AUTH-03)
  await loginAndSaveState();
}
