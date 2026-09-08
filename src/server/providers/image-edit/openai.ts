import { ImageEditError, type ImageEditInput, type ImageEditProvider, type ImageEditResult } from './types';

const ENDPOINT = 'https://api.openai.com/v1/images/edits';

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_IMAGE_QUALITY = 'medium';

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** The edit endpoint rejects larger uploads; the caller downscales before reaching this. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

interface OpenAiImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string; code?: string; type?: string };
}

function base64ToBytes(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Maps a provider failure onto something the UI can say without leaking API detail.
 *
 * The verification case matters: OpenAI gates the image models behind organization
 * verification, and an unverified key fails every request with a 403 that otherwise looks
 * like a generic error.
 */
function describeFailure(status: number, body: string): ImageEditError {
  let parsed: OpenAiImageResponse | null = null;
  try {
    parsed = JSON.parse(body) as OpenAiImageResponse;
  } catch {
    parsed = null;
  }
  const detail = parsed?.error?.message ?? '';
  const code = parsed?.error?.code ?? '';

  if (status === 403 && /verif/i.test(`${detail} ${code}`)) {
    return new ImageEditError(
      'OpenAI-organisationen er ikke verificeret til billedmodellen.',
      'not-verified',
      status,
    );
  }
  if (status === 400 && /safety|moderation|content policy|rejected/i.test(`${detail} ${code}`)) {
    return new ImageEditError('Forespørgslen blev afvist af billedmodellen.', 'rejected', status);
  }
  if (status === 429) {
    return new ImageEditError('Billedmodellen er optaget lige nu.', 'rate-limited', status);
  }
  return new ImageEditError(
    `Billedmodellen svarede med status ${status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    'provider-error',
    status,
  );
}

export class OpenAiImageEditProvider implements ImageEditProvider {
  readonly model: string;
  private readonly quality: string;

  constructor(
    private readonly apiKey: string,
    options: { model?: string; quality?: string } = {},
  ) {
    this.model = options.model?.trim() || DEFAULT_IMAGE_MODEL;
    this.quality = options.quality?.trim() || DEFAULT_IMAGE_QUALITY;
  }

  async edit(input: ImageEditInput): Promise<ImageEditResult> {
    if (!SUPPORTED_TYPES.has(input.contentType)) {
      throw new ImageEditError('Billedformatet kan ikke redigeres. Brug JPEG, PNG eller WebP.', 'unsupported-image');
    }
    if (input.image.byteLength > MAX_SOURCE_BYTES) {
      throw new ImageEditError('Billedet er for stort til at redigere.', 'unsupported-image');
    }

    const form = new FormData();
    form.append(
      'image',
      new Blob([input.image], { type: input.contentType }),
      `scene.${extensionFor(input.contentType)}`,
    );
    form.append('prompt', input.prompt);
    form.append('model', this.model);
    form.append('n', '1');
    form.append('quality', this.quality);
    // Keep the real photo recognisable rather than reimagining the garden from scratch.
    form.append('input_fidelity', 'high');

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
    } catch (error) {
      throw new ImageEditError(
        `Billedmodellen kunne ikke kontaktes: ${error instanceof Error ? error.message : 'ukendt fejl'}`,
        'provider-error',
      );
    }

    if (!response.ok) {
      throw describeFailure(response.status, await response.text().catch(() => ''));
    }

    const body = (await response.json()) as OpenAiImageResponse;
    const encoded = body.data?.[0]?.b64_json;
    if (!encoded) {
      throw new ImageEditError('Billedmodellen returnerede ikke et billede.', 'provider-error');
    }

    return { bytes: base64ToBytes(encoded), contentType: 'image/png' };
  }
}
