import { expect, test } from '@playwright/test';

test('first user can create, map and understand a garden', async ({ page }) => {
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

    const detailResponse = (await fetch(`/api/gardens/${gardenId}`).then((response) => response.json())) as {
      garden: { features: Array<{ name: string }> };
    };
    return detailResponse.garden.features[0]?.name;
  });

  expect(persistedName).toBe('Æbletræ');

  await page.getByRole('button', { name: 'Kortlæg' }).click();
  await expect(page.getByRole('heading', { name: 'Forstå din have' })).toBeVisible();

  const walkResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/walks') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Start havevandring' }).click();
  const walkResponse = await walkResponsePromise;
  expect(walkResponse.status(), await walkResponse.text()).toBe(201);
  await expect(page.getByRole('button', { name: 'Næste stop' })).toBeVisible();

  await page.getByLabel('Navn, hvis du kender det').fill('Syren');
  const plantResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/plants') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Gem plante' }).click();
  const plantResponse = await plantResponsePromise;
  expect(plantResponse.status(), await plantResponse.text()).toBe(201);
  await expect(page.getByRole('heading', { name: '1 registrerede planter' })).toBeVisible();

  await page.getByText('Registrér haveforhold', { exact: true }).click();
  await page.getByLabel('Beskrivelse').fill('Sol fra middag til aften');
  const assessmentResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/assessments') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Gem haveforhold' }).click();
  const assessmentResponse = await assessmentResponsePromise;
  expect(assessmentResponse.status(), await assessmentResponse.text()).toBe(201);

  const understandingBeforeReload = await page.evaluate(async () => {
    const gardens = (await fetch('/api/gardens').then((response) => response.json())) as {
      gardens: Array<{ id: string }>;
    };
    const gardenId = gardens.gardens[0]?.id;
    if (!gardenId) throw new Error('Garden missing before understanding check');
    const response = (await fetch(`/api/gardens/${gardenId}/understanding`).then((item) => item.json())) as {
      understanding: { walk: { status: string } | null; plants: Array<{ commonName: string }>; assessments: Array<{ value: string }> };
    };
    return response.understanding;
  });
  expect(understandingBeforeReload.walk?.status).toBe('active');
  expect(understandingBeforeReload.plants[0]?.commonName).toBe('Syren');
  expect(understandingBeforeReload.assessments[0]?.value).toBe('Sol fra middag til aften');

  await page.reload();
  await expect(page.locator('.garden-name')).toHaveText('Vores have');
  await page.getByRole('button', { name: 'Kortlæg' }).click();
  await expect(page.getByRole('heading', { name: '1 registrerede planter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Næste stop' })).toBeVisible();

  const reloadedState = await page.evaluate(async () => {
    const gardens = (await fetch('/api/gardens').then((response) => response.json())) as {
      gardens: Array<{ id: string }>;
    };
    const gardenId = gardens.gardens[0]?.id;
    if (!gardenId) throw new Error('Garden missing after reload');
    const [detail, understanding] = await Promise.all([
      fetch(`/api/gardens/${gardenId}`).then((response) => response.json()) as Promise<{ garden: { features: Array<{ name: string }> } }>,
      fetch(`/api/gardens/${gardenId}/understanding`).then((response) => response.json()) as Promise<{
        understanding: { plants: Array<{ commonName: string }>; assessments: Array<{ value: string }> };
      }>,
    ]);
    return {
      featureName: detail.garden.features[0]?.name,
      plantName: understanding.understanding.plants[0]?.commonName,
      assessment: understanding.understanding.assessments[0]?.value,
    };
  });

  expect(reloadedState).toEqual({
    featureName: 'Æbletræ',
    plantName: 'Syren',
    assessment: 'Sol fra middag til aften',
  });
});
