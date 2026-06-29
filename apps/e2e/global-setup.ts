import { GenericContainer } from 'testcontainers';
import type { FullConfig } from '@playwright/test';

import { createTestDynamoDBClient, createTable } from './src/db/init';
import { seedTestData } from './src/db/seed';
import { loginAndSaveState } from './src/auth/login';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Step 1: Start DynamoDB Local container on fixed host port 8000
  // Ryuk reaper handles container cleanup automatically on process exit
  const container = await new GenericContainer('amazon/dynamodb-local')
    .withExposedPorts({ container: 8000, host: 8000 })
    .start();

  void container; // container lifecycle managed by Ryuk

  // Step 2: Create DynamoDB table with production schema
  const dbClient = createTestDynamoDBClient();
  await createTable(dbClient);

  // Step 3: Seed minimum test data
  await seedTestData(dbClient);

  // Step 4: Browser UI login — saves session to .auth/user.json
  await loginAndSaveState();
}
