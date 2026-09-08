import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_QUALITY,
  OpenAiImageEditProvider,
} from '../../src/server/providers/image-edit/openai';
import { ImageEditError } from '../../src/server/providers/image-edit/types';
import { buildVisualizationPrompt } from '../../src/server/providers/image-edit/prompt';
import { EMPTY_PROFILE } from '../../src/shared/profile';
import type { AreaProfile, PlantIdentification, PlantSuggestion } from '../../src/shared/types';

const PNG_BASE64 = 'aGVsbG8=';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(response: Response | (() => Response)) {
  const spy = vi.fn(async () => (typeof response === 'function' ? response() : response));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function sourceImage(bytes = 8): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

afterEach(() => vi.unstubAllGlobals());

describe('OpenAiImageEditProvider', () => {
  it('posts a multipart edit request with the expected fields', async () => {
    const spy = stubFetch(jsonResponse({ data: [{ b64_json: PNG_BASE64 }] }));
    const provider = new OpenAiImageEditProvider('sk-test');

    const result = await provider.edit({
      image: sourceImage(),
      contentType: 'image/jpeg',
      prompt: 'flere stauder',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');

    const form = init.body as FormData;
    expect(form.get('model')).toBe(DEFAULT_IMAGE_MODEL);
    expect(form.get('quality')).toBe(DEFAULT_IMAGE_QUALITY);
    expect(form.get('prompt')).toBe('flere stauder');
    expect(form.get('n')).toBe('1');
    // Without high input fidelity the model reinvents the garden instead of editing the photo.
    expect(form.get('input_fidelity')).toBe('high');
    expect(form.get('image')).toBeInstanceOf(Blob);

    expect(result.contentType).toBe('image/png');
    expect(new TextDecoder().decode(result.bytes)).toBe('hello');
  });

  it('honours model and quality overrides', async () => {
    const spy = stubFetch(jsonResponse({ data: [{ b64_json: PNG_BASE64 }] }));
    const provider = new OpenAiImageEditProvider('sk-test', { model: 'gpt-image-1', quality: 'high' });
    expect(provider.model).toBe('gpt-image-1');

    await provider.edit({ image: sourceImage(), contentType: 'image/png', prompt: 'x' });
    const form = (spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get('model')).toBe('gpt-image-1');
    expect(form.get('quality')).toBe('high');
  });

  it('falls back to defaults for blank overrides', () => {
    const provider = new OpenAiImageEditProvider('sk-test', { model: '  ', quality: '' });
    expect(provider.model).toBe(DEFAULT_IMAGE_MODEL);
  });

  it('rejects an image format the endpoint cannot take, without calling out', async () => {
    const spy = stubFetch(jsonResponse({}));
    const provider = new OpenAiImageEditProvider('sk-test');
    await expect(
      provider.edit({ image: sourceImage(), contentType: 'image/gif', prompt: 'x' }),
    ).rejects.toMatchObject({ code: 'unsupported-image' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports organization verification separately from other 403s', async () => {
    stubFetch(
      jsonResponse(
        { error: { message: 'Your organization must be verified to use the model `gpt-image-2`.' } },
        403,
      ),
    );
    const provider = new OpenAiImageEditProvider('sk-test');
    await expect(provider.edit({ image: sourceImage(), contentType: 'image/jpeg', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'not-verified', status: 403 });
  });

  it('maps a moderation refusal to a rejected error', async () => {
    stubFetch(jsonResponse({ error: { message: 'Request rejected by content policy' } }, 400));
    const provider = new OpenAiImageEditProvider('sk-test');
    await expect(provider.edit({ image: sourceImage(), contentType: 'image/jpeg', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'rejected' });
  });

  it('maps rate limiting', async () => {
    stubFetch(jsonResponse({ error: { message: 'slow down' } }, 429));
    const provider = new OpenAiImageEditProvider('sk-test');
    await expect(provider.edit({ image: sourceImage(), contentType: 'image/jpeg', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'rate-limited' });
  });

  it('fails clearly when the response carries no image', async () => {
    stubFetch(jsonResponse({ data: [] }));
    const provider = new OpenAiImageEditProvider('sk-test');
    await expect(provider.edit({ image: sourceImage(), contentType: 'image/jpeg', prompt: 'x' }))
      .rejects.toBeInstanceOf(ImageEditError);
  });

  it('does not leak the API key in an error message', async () => {
    stubFetch(jsonResponse({ error: { message: 'boom' } }, 500));
    const provider = new OpenAiImageEditProvider('sk-super-secret');
    await expect(provider.edit({ image: sourceImage(), contentType: 'image/jpeg', prompt: 'x' }))
      .rejects.toSatisfy((error: Error) => !error.message.includes('sk-super-secret'));
  });
});

describe('buildVisualizationPrompt', () => {
  function suggestion(overrides: Partial<PlantSuggestion> = {}): PlantSuggestion {
    return { scientificName: 'Lavandula angustifolia', commonName: 'Lavendel', score: 0.89, gbifId: null, ...overrides };
  }
  function plant(overrides: Partial<PlantIdentification> = {}): PlantIdentification {
    return {
      id: 'p1', sceneId: 's1', imageId: 'i1', organ: 'auto',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: null,
      suggestions: [suggestion()], selectedSuggestionIndex: 0,
      nickname: '', note: '', includeInAnalysis: true, image: null,
      ...overrides,
    };
  }
  const profile: AreaProfile = {
    ...EMPTY_PROFILE, sun: 'full_sun', moisture: 'dry', soil: 'sand', drainage: 'fast',
    wind: 'exposed', goals: ['Bestøvere'], notes: 'Skrånende mod syd',
  };

  it('states the structural constraints that keep it the same garden', () => {
    const prompt = buildVisualizationPrompt({ instruction: 'mere farve', profile, identifications: [] });
    for (const phrase of ['kameravinkel', 'hus', 'terrasse', 'hegn', 'stier', 'Behold det eksisterende foto']) {
      expect(prompt).toContain(phrase);
    }
    expect(prompt).toContain('mere farve');
  });

  it('includes the site conditions in readable form, not raw enum values', () => {
    const prompt = buildVisualizationPrompt({ instruction: 'x', profile, identifications: [] });
    expect(prompt).toContain('fuld sol');
    expect(prompt).toContain('sandet jord');
    expect(prompt).toContain('hurtigt dræn');
    expect(prompt).toContain('vindudsat');
    expect(prompt).toContain('Bestøvere');
    expect(prompt).toContain('Skrånende mod syd');
    expect(prompt).not.toContain('full_sun');
  });

  it('carries opted-in plants with the user labels', () => {
    const prompt = buildVisualizationPrompt({
      instruction: 'x',
      profile,
      identifications: [plant({ nickname: 'Den lilla bagest', note: 'ved hegnet' })],
    });
    expect(prompt).toContain('Den lilla bagest');
    expect(prompt).toContain('Lavendel');
    expect(prompt).toContain('ved hegnet');
  });

  it('leaves out plants the user switched off', () => {
    const prompt = buildVisualizationPrompt({
      instruction: 'x',
      profile,
      identifications: [plant({ id: 'off', includeInAnalysis: false })],
    });
    expect(prompt).not.toContain('Lavendel');
  });

  it('flags a weakly identified plant instead of asserting the species', () => {
    const prompt = buildVisualizationPrompt({
      instruction: 'x',
      profile,
      identifications: [plant({ suggestions: [suggestion({ score: 0.2 })] })],
    });
    expect(prompt).toContain('usikker bestemmelse');
  });

  it('works with an empty profile and no plants', () => {
    const prompt = buildVisualizationPrompt({
      instruction: 'ryd op',
      profile: EMPTY_PROFILE,
      identifications: [],
    });
    expect(prompt).toContain('ryd op');
    expect(prompt).toContain('Absolutte krav');
  });
});
