// TODO: use real config management (e.g. dotenv, config files, etc.)

export type Config = {
  dynamoDBTable: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
};

export function config() {
  const conf = {} as Config;

  return {
    dynamoDBTable(tableName?: string) {
      if (!tableName) {
        throw new Error('DynamoDB table name is required');
      }
      conf.dynamoDBTable = tableName;
      return this;
    },
    cognitoUserPoolId(id?: string) {
      if (!id) {
        throw new Error('Cognito user pool ID is required');
      }
      conf.cognitoUserPoolId = id;
      return this;
    },
    cognitoClientId(id?: string) {
      if (!id) {
        throw new Error('Cognito client ID is required');
      }
      conf.cognitoClientId = id;
      return this;
    },
    build(): Config {
      return conf as Config;
    },
  };
}
