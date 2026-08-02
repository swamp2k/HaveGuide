import { expect, test } from '@playwright/test';

test('first user can create a garden and persist a map feature', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Brugernavn').fill('haveejer');
  await page.getByLabel('Adgangskode').fill('meget-hemmelig-havekode');
  await page.getByRole('button', { name: 'Opret bruger' }).click();

  await page.getByLabel('Navn').fill('Vores have');
  await page.getByRole('button', { name: 'Opret have' }).click();
  await expect(page.getByText('Vores have')).toBeVisible();

  const persistedName = await page.evaluate(async () => {
    const gardensResponse = await fetch('/api/gardens').then((response) => response.json()) as {
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

    const gardenResponse = await fetch(`/api/gardens/${gardenId}`).then((response) => response.json()) as {
      garden: { features: Array<{ name: string }> };
    };
    return gardenResponse.garden.features[0]?.name;
  });

  expect(persistedName).toBe('Æbletræ');
});
