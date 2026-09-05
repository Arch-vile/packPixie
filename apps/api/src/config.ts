// TODO: use real config management (e.g. dotenv, config files, etc.)

export type Config = {
  dynamoDBTable: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  // Only ever true outside NODE_ENV=production (enforced in index.ts). When true,
  // the auth plugin skips Cognito verification and trusts a hand-crafted
  // Authorization header instead — local API testing only.
  authDevBypass: boolean;
};

export function config() {
  const conf: Partial<Config> = {};

  return {
    dynamoDBTable(tableName?: string) {
      conf.dynamoDBTable = tableName;
      return this;
    },
    cognitoUserPoolId(id?: string) {
      conf.cognitoUserPoolId = id;
      return this;
    },
    cognitoClientId(id?: string) {
      conf.cognitoClientId = id;
      return this;
    },
    authDevBypass(enabled: boolean) {
      conf.authDevBypass = enabled;
      return this;
    },
    build(): Config {
      if (!conf.dynamoDBTable) {
        throw new Error('DynamoDB table name is required');
      }
      if (!conf.authDevBypass) {
        if (!conf.cognitoUserPoolId) {
          throw new Error('Cognito user pool ID is required');
        }
        if (!conf.cognitoClientId) {
          throw new Error('Cognito client ID is required');
        }
      }
      return { ...conf, authDevBypass: conf.authDevBypass ?? false } as Config;
    },
  };
}
