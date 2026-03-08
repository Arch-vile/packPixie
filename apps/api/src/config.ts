// TODO: use real config management (e.g. dotenv, config files, etc.)

export type Config = {
  dynamoDBTable: string;
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
    build(): Config {
      return conf as Config;
    },
  };
}
