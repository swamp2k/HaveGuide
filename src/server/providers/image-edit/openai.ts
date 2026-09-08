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

/**
 * `input_fidelity: high` is what stops gpt-image-1 reinventing the garden instead of editing the
 * photo, so it is not optional there. gpt-image-2 removed the parameter — it processes every input
 * at high fidelity unconditionally — and rejects the request outright if it is sent:
 *
 *   400 invalid_input_fidelity_model: The model 'gpt-image-2' does not support the
 *   'input_fidelity' parameter.
 *
 * Sending it only to the models that still take it keeps the photo recognisable on both.
 */
function supportsInputFidelity(model: string): boolean {
  return /^gpt-image-1(\b|[.-])/.test(model);
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

  // The upstream text is kept on every branch: this message is only ever logged server-side
  // (routes pick the user-facing wording from `code`), and without it a 429 for "no credit"
  // is indistinguishable from a 429 for "too many requests".
  const suffix = ` [${status}${code ? ` ${code}` : ''}${detail ? `: ${detail.slice(0, 300)}` : ''}]`;

  if (status === 403 && /verif/i.test(`${detail} ${code}`)) {
    return new ImageEditError(
      `OpenAI-organisationen er ikke verificeret til billedmodellen.${suffix}`,
      'not-verified',
      status,
    );
  }
  if (status === 400 && /safety|moderation|content policy|rejected/i.test(`${detail} ${code}`)) {
    return new ImageEditError(`Forespørgslen blev afvist af billedmodellen.${suffix}`, 'rejected', status);
  }
  if (status === 429) {
    // OpenAI also answers 429 when the account is out of credit, which is not a retry situation.
    const outOfCredit =
      /insufficient_quota|credit_balance_exhausted|billing_hard_limit_reached/i.test(code) ||
      /no credits remaining|exceeded your current quota|insufficient[_ ]quota|billing/i.test(detail);
    return new ImageEditError(
      `${outOfCredit ? 'OpenAI-kontoen har ikke mere kvote.' : 'Billedmodellen er optaget lige nu.'}${suffix}`,
      outOfCredit ? 'no-credit' : 'rate-limited',
      status,
    );
  }
  return new ImageEditError(`Billedmodellen svarede med en fejl.${suffix}`, 'provider-error', status);
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
    if (supportsInputFidelity(this.model)) form.append('input_fidelity', 'high');

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
