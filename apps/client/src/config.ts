function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value as string;
}

const config = {
  apiUrl: requireEnv('VITE_API_URL'),
  cognito: {
    userPoolId: requireEnv('VITE_COGNITO_USER_POOL_ID'),
    userPoolClientId: requireEnv('VITE_COGNITO_USER_POOL_CLIENT_ID'),
  },
} as const;

export default config;
