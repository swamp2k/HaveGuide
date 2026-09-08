import type * as CV from '@techstark/opencv-js';

/**
 * OpenCV.js is loaded as a plain static asset rather than through the bundler: it is a
 * ~11 MB emscripten file with the WASM embedded as a data URI. Keeping it out of the module
 * graph means the app bundle stays small and the runtime is only fetched the first time
 * somebody actually stitches a panorama.
 *
 * The type import above is erased at compile time, so importing the package here costs nothing.
 */
export type OpenCv = typeof CV;

export const OPENCV_ASSET_URL = '/vendor/opencv.js';

/** Loading the runtime on a cold cache over a phone connection is genuinely slow. */
const LOAD_TIMEOUT_MS = 120_000;

declare global {
  interface Window {
    cv?: unknown;
  }
}

/**
 * The runtime is handed around inside a box.
 *
 * Emscripten makes its module object thenable, so resolving or returning it from a promise
 * makes that promise try to adopt it — which re-enters `then` forever and starves the event
 * loop. Wrapping it means no promise ever sees the thenable; {@link markResolved} additionally
 * removes `then`, which is the workaround Emscripten itself recommends.
 */
interface Boxed {
  value: OpenCv;
}

let pending: Promise<Boxed> | null = null;

function isReady(candidate: unknown): candidate is OpenCv {
  const cv = candidate as Partial<OpenCv> | undefined;
  return Boolean(cv && typeof cv.Mat === 'function' && typeof cv.ORB === 'function');
}

function markResolved(cv: OpenCv): Boxed {
  try {
    delete (cv as unknown as { then?: unknown }).then;
  } catch {
    /* non-configurable in some builds; the box alone is still enough */
  }
  return { value: cv };
}

function injectScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-opencv="${url}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('load failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.opencv = url;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('load failed')), { once: true });
    document.head.appendChild(script);
  });
}

/**
 * The UMD build assigns `window.cv` synchronously, but the WASM runtime initialises later.
 * Emscripten also makes the module thenable, which makes `await cv` unsafe, so we wait on
 * `onRuntimeInitialized` and poll as a backstop for the case where it already fired.
 */
function waitForRuntime(): Promise<Boxed> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + LOAD_TIMEOUT_MS;
    let settled = false;

    const finish = () => {
      if (settled) return;
      const cv = window.cv;
      if (!isReady(cv)) return;
      settled = true;
      window.clearInterval(timer);
      resolve(markResolved(cv));
    };

    const timer = window.setInterval(() => {
      if (settled) return;
      finish();
      if (!settled && Date.now() > deadline) {
        settled = true;
        window.clearInterval(timer);
        reject(new Error('OpenCV-runtime startede ikke i tide.'));
      }
    }, 50);

    const module = window.cv as { onRuntimeInitialized?: () => void } | undefined;
    if (module && !isReady(module)) {
      module.onRuntimeInitialized = finish;
    }
    finish();
  });
}

/**
 * Resolves once the OpenCV runtime is usable. Concurrent callers share one load, and a
 * failed load is not cached so the user can retry.
 */
export async function loadOpenCv(): Promise<OpenCv> {
  if (isReady(window.cv)) return markResolved(window.cv).value;
  if (!pending) {
    pending = (async () => {
      await injectScript(OPENCV_ASSET_URL).catch(() => {
        throw new Error('Billedmotoren kunne ikke hentes.');
      });
      return waitForRuntime();
    })();
  }

  try {
    // Unwrapping here is what keeps the thenable module out of the promise chain.
    return (await pending).value;
  } catch (error) {
    pending = null;
    throw error;
  }
}

/** Frees a batch of OpenCV objects, ignoring anything already released. */
export function release(...items: Array<{ delete: () => void } | null | undefined>): void {
  for (const item of items) {
    if (!item) continue;
    try {
      item.delete();
    } catch {
      /* already deleted, or deleted by a parent container */
    }
  }
}
