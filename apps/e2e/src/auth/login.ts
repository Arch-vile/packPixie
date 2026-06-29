import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';

import { config } from '../config';

const AUTH_STATE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '.auth',
  'user.json',
);

export async function loginAndSaveState(): Promise<void> {
  const { baseURL, testUserEmail: email, testUserPassword: password } = config.auth;

  // Ensure .auth/ directory exists before writing storageState
  mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
await page.goto(baseURL);

    // Wait for Amplify Authenticator to hydrate before interacting with form fields
    await page.waitForSelector('[data-amplify-authenticator]', {
      timeout: 15_000,
    });

    await page.getByRole('textbox', { name: /email/i }).fill(email);
    await page.getByRole('textbox', { name: /password/i }).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // App is a SPA — URL never changes after login. Wait for the Amplify
    // Authenticator form to detach from the DOM, which confirms the Cognito
    // token exchange completed and the app has rendered.
    await page.waitForSelector('[data-amplify-authenticator] form', {
      state: 'detached',
      timeout: 30_000,
    });

    await context.storageState({ path: AUTH_STATE_PATH });
  } finally {
    await browser.close();
  }
}
