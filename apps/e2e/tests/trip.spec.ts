import { test, expect } from '../src/fixtures/index';

test('user can create a trip and see it in the list', async ({ page }) => {
  await page.goto('/');

  // Wait for app to be ready — storageState is loaded but the React tree must hydrate
  await expect(page.getByTestId('signed-in-label')).toBeVisible();

  const tripName = `E2E Trip ${Date.now()}`;

  await page.getByRole('button', { name: '+ New Trip' }).click();
  await page.getByPlaceholder('Trip name').fill(tripName);

  // Register the waitForResponse listener BEFORE clicking Create. Playwright's event
  // model requires the listener to be active when the request fires. Promise.all
  // ensures both the listener registration and the click happen atomically.
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/api/trips') &&
        r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);

  // After the POST resolves, TripList calls getTrips() before updating state.
  // Playwright's built-in auto-waiting in toBeVisible() covers the GET round-trip.
  await expect(
    page.getByTestId('trip-name').filter({ hasText: tripName }),
  ).toBeVisible();
});
