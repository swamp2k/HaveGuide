export interface ImageEditInput {
  image: ArrayBuffer;
  contentType: string;
  prompt: string;
}

export interface ImageEditResult {
  bytes: ArrayBuffer;
  contentType: string;
}

/**
 * Edits a photo according to a prompt. Deliberately narrow: HaveGuide only ever asks for one
 * edited version of one photo, so swapping the provider stays a small change.
 */
export interface ImageEditProvider {
  readonly model: string;
  edit(input: ImageEditInput): Promise<ImageEditResult>;
}

/** Thrown when the provider itself refuses or fails, so routes can answer with a useful message. */
export class ImageEditError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unsupported-image'
      | 'rejected'
      | 'not-verified'
      | 'rate-limited'
      | 'no-credit'
      | 'provider-error',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ImageEditError';
  }
}
