import { test, expect } from '../src/fixtures/index';
import { config } from '../src/config';

test('authenticated user sees signed-in label', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('signed-in-label')).toBeVisible();
  await expect(page.getByTestId('signed-in-label')).toContainText(
    config.auth.testUserEmail,
  );
});
