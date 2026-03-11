import { Amplify } from 'aws-amplify';
import config from './config';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.cognito.userPoolId,
      userPoolClientId: config.cognito.userPoolClientId,
      loginWith: {
        email: true,
      },
    },
  },
});
