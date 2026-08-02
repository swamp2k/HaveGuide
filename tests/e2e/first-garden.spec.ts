import { expect, test } from '@playwright/test';

test('first user can create a garden and persist a map feature', async ({ page }) => {
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.error(`[browser-error] ${error.message}`));

  await page.goto('/');

  await page.getByLabel('Brugernavn').fill('haveejer');
  await page.getByLabel('Adgangskode').fill('meget-hemmelig-havekode');
  const setupResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/setup') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Opret bruger' }).click();
  const setupResponse = await setupResponsePromise;
  expect(setupResponse.status(), await setupResponse.text()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Opret din have' })).toBeVisible();

  await page.getByLabel('Navn').fill('Vores have');
  const gardenResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/gardens') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Opret have' }).click();
  const gardenResponse = await gardenResponsePromise;
  expect(gardenResponse.status(), await gardenResponse.text()).toBe(201);
  await expect(page.locator('.garden-name')).toHaveText('Vores have', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Tilføj på kortet/ })).toBeVisible();

  const persistedName = await page.evaluate(async () => {
    const gardensResponse = (await fetch('/api/gardens').then((response) => response.json())) as {
      gardens: Array<{ id: string }>;
    };
    const gardenId = gardensResponse.gardens[0]?.id;
    if (!gardenId) throw new Error('Garden missing');

    const featureResponse = await fetch(`/api/gardens/${gardenId}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'tree',
        name: 'Æbletræ',
        description: 'Ved terrassen',
        confidence: 'certain',
        geometry: { type: 'Point', coordinates: [10.7, 56.2] },
      }),
    });
    if (!featureResponse.ok) throw new Error(await featureResponse.text());

    const gardenResponse = (await fetch(`/api/gardens/${gardenId}`).then((response) => response.json())) as {
      garden: { features: Array<{ name: string }> };
    };
    return gardenResponse.garden.features[0]?.name;
  });

  expect(persistedName).toBe('Æbletræ');

  await page.reload();
  await expect(page.locator('.garden-name')).toHaveText('Vores have');
  const reloadedFeature = await page.evaluate(async () => {
    const gardens = (await fetch('/api/gardens').then((response) => response.json())) as {
      gardens: Array<{ id: string }>;
    };
    const gardenId = gardens.gardens[0]?.id;
    if (!gardenId) throw new Error('Garden missing after reload');
    const detail = (await fetch(`/api/gardens/${gardenId}`).then((response) => response.json())) as {
      garden: { features: Array<{ name: string }> };
    };
    return detail.garden.features[0]?.name;
  });
  expect(reloadedFeature).toBe('Æbletræ');
});
