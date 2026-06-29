function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        'Copy apps/e2e/.env.example to apps/e2e/.env.test and fill in the values.',
    );
  }
  return value;
}

export const config = {
  db: {
    region: required('AWS_REGION'),
    endpoint: required('LOCAL_DYNAMODB_URL'),
    tableName: required('DYNAMODB_TABLE'),
  },
  auth: {
    baseURL: required('BASE_URL'),
    testUserEmail: required('TEST_USER_EMAIL'),
    testUserPassword: required('TEST_USER_PASSWORD'),
  },
} as const;
