import { expect, test } from '@playwright/test';

const garden = { id: 'garden-test', name: 'Familiehaven', address: '', notes: '', centerLat: 56.2, centerLng: 10.7, createdAt: '', updatedAt: '', features: [{ id: 'bed', name: 'Ved terrassen', type: 'bed', geometry: { type: 'Polygon', coordinates: [[[10.7,56.2],[10.7001,56.2],[10.7001,56.2001],[10.7,56.2]]] } }] };

for (const failure of ['upload', 'link', 'close'] as const) {
test(`simple mobile navigation retains photo progress after ${failure} failure`, async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: () => { throw new Error('Gallery must not request GPS'); } });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let plants: object[] = [];
  let creates = 0;
  let uploads = 0;
  let links = 0;
  let captureReads = 0;
  let identifyCalls = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (path === '/api/auth/bootstrap') return json({ setupRequired: false, authenticated: true, user: { id: 'user', username: 'haveejer' } });
    if (path === '/api/gardens') return json({ gardens: [garden] });
    if (path === '/api/gardens/garden-test') return json({ garden });
    if (path === '/api/map/config') return json({ aerialAvailable: false });
    if (path.endsWith('/understanding')) return json({ understanding: { plants, plantIdentificationAvailable: true } });
    if (path.endsWith('/plants') && method === 'POST') {
      creates++;
      const plant = { ...route.request().postDataJSON(), id: 'plant', gardenId: garden.id, media: [], suggestions: [] };
      plants = [plant]; return json({ plant }, 201);
    }
    if (path === '/api/media' && method === 'POST') {
      uploads++;
      if (failure !== 'link' && uploads === 1) return json({ error: 'Upload afbrudt' }, 503);
      return json({ media: { id: 'photo' } }, 201);
    }
    if (path.endsWith('/plants/plant/media')) {
      links++;
      if (failure === 'link' && links === 1) return json({ error: 'Forbindelsen blev afbrudt' }, 503);
      plants = plants.map((plant) => ({ ...plant, media: [{ mediaId: 'photo', contentUrl: '/icon.svg', organ: 'auto', originalFilename: 'Foto' }] }));
      return json({ ok: true });
    }
    if (path.endsWith('/identify')) { identifyCalls++; return json({ error: 'Genkendelsen er optaget' }, 503); }
    if (path.endsWith('/capture')) { captureReads++; return json({ workspace: { activeSession: null, sessions: [], aerialAvailable: false } }); }
    return json({ error: `Unexpected test request: ${path}` }, 404);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hvad vil du i haven?' })).toBeVisible();
  await page.screenshot({ path: `test-results/${failure}-home.png`, fullPage: true });
  expect(captureReads).toBe(0);
  await expect(page.getByText('Spatial rekonstruktion', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '📷 Tilføj plante', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tilføj en plante' })).toBeVisible();
  // A small valid PNG; browser compression is exercised before upload.
  await page.locator('input[type=file]').last().setInputFiles({ name: 'leaf.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGN0arJnIAUwkaR6VMOohiGlAQBLagEjdrTcrAAAAABJRU5ErkJggg==', 'base64') });
  await expect(page.getByAltText('Dit foto af planten')).toBeVisible();
  await page.getByLabel('Navn, hvis du kender det').fill('Syren');
  await page.getByLabel('Hvor står den?').selectOption('bed');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Rundtur', exact: true }).click();
  await expect(page.getByLabel('Navn, hvis du kender det')).toHaveValue('Syren');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${failure}-capture.png`, fullPage: true });
  await page.getByRole('button', { name: 'Gem og find planten', exact: true }).click();
  await expect(page.getByText(/Dine valg er her stadig/)).toBeVisible();
  if (failure === 'close') {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Luk', exact: true }).click();
    await expect(page.getByRole('button', { name: /Syren/ })).toBeVisible();
    expect(creates).toBe(1);
    return;
  }
  await page.getByRole('button', { name: 'Gem og find planten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Planter i haven' })).toBeVisible();
  await expect(page.getByText(/Planten og billedet er gemt/)).toBeVisible();
  expect(creates).toBe(1); expect(uploads).toBe(failure === 'upload' ? 2 : 1); expect(links).toBe(failure === 'link' ? 2 : 1); expect(identifyCalls).toBe(1);
  await expect(page.getByRole('heading', { name: 'Syren' })).toBeVisible();
  await page.screenshot({ path: `test-results/${failure}-plant.png`, fullPage: true });
  await page.getByRole('button', { name: 'Rundtur', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tag en rundtur i haven' })).toBeVisible();
  expect(captureReads).toBeGreaterThan(0);
  await expect(page.locator('.smart-scan-card')).toHaveCount(0);
  await page.screenshot({ path: `test-results/${failure}-tour.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mere', exact: true }).click();
  await expect(page.getByRole('button', { name: /Idéer og planer/ })).toBeVisible();
  await page.screenshot({ path: `test-results/${failure}-more.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
}
