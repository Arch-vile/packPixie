import { GenericContainer } from 'testcontainers';
import type { FullConfig } from '@playwright/test';

import { createTestDynamoDBClient, createTable } from './src/db/init';
import { loginAndSaveState } from './src/auth/login';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Step 1: Start DynamoDB Local container on fixed host port 8000
  // Ryuk reaper handles container cleanup automatically on process exit
  //
  // -sharedDb is REQUIRED. Without it, DynamoDB Local (in -inMemory mode)
  // silently partitions storage into a separate hidden database per
  // (AWS access key ID + region). Our two clients establish that identity
  // differently: the test harness pins credentials { accessKeyId: 'local' }
  // (src/db/init.ts), while the API sets no credentials and falls through to
  // the default AWS provider chain (apps/api/src/lib/dynamodb.ts). Those two
  // identities land in different namespaces, so the table this setup creates
  // is invisible to the API — every write fails with
  // "Cannot do operations on a non-existent table".
  // -sharedDb collapses the instance to ONE database that all clients share,
  // regardless of credentials or region. It is scoped to THIS ephemeral,
  // in-memory container only — it does not touch any DynamoDB you run for
  // local app development (separate process, separate data, torn down after
  // the run). Full write-up in README.md → Troubleshooting → "Cannot do
  // operations on a non-existent table".
  const container = await new GenericContainer('amazon/dynamodb-local')
    .withCommand(['-jar', 'DynamoDBLocal.jar', '-inMemory', '-sharedDb'])
    .withExposedPorts({ container: 8000, host: 8000 })
    .start();

  void container; // container lifecycle managed by Ryuk

  // Step 2: Create DynamoDB table with production schema
  const dbClient = createTestDynamoDBClient();
  await createTable(dbClient);

  // Step 3: Browser UI login — saves session to .auth/user.json
  await loginAndSaveState();
}
