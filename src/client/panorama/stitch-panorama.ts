import type { Mat } from '@techstark/opencv-js';
import { loadOpenCv, release, type OpenCv } from './opencv-loader';
import {
  DEFAULT_LIMITS,
  accumulate,
  contentBounds,
  judgeHomography,
  planCanvas,
  rescaleHomography,
  trimToSolid,
  type Matrix3,
  type RejectionReason,
} from './geometry';

export const MIN_PANORAMA_PHOTOS = 2;
export const MAX_PANORAMA_PHOTOS = 6;

/** Feature detection runs here; small enough to be quick, big enough for foliage detail. */
const WORK_MAX_DIMENSION = 1200;
/** Warping runs here, so the panorama keeps more detail than the matching pass needs. */
const COMPOSE_MAX_DIMENSION = 1600;

const CANVAS_LIMITS = { maxWidth: 7200, maxHeight: 1800, maxPixels: 6_000_000 };

const ORB_FEATURES = 2000;
const LOWE_RATIO = 0.75;
const RANSAC_REPROJECTION_PX = 3;

/** Horizontal feather band, as a fraction of frame width. Overlap lives near the edges. */
const FEATHER_X = 0.28;
/** A much smaller vertical ramp, only to soften the warped top/bottom edges. */
const FEATHER_Y = 0.03;
/** Accumulated weight below this counts as "nothing painted here". */
const COVERAGE_EPSILON = 0.004;

const JPEG_QUALITY = 0.88;

export type PanoramaStage = 'engine' | 'reading' | 'matching' | 'composing' | 'encoding';

export interface PanoramaProgress {
  stage: PanoramaStage;
  message: string;
  current?: number;
  total?: number;
}

export type PanoramaFailureCode =
  | 'too-few-photos'
  | 'too-many-photos'
  | 'engine-unavailable'
  | 'decode-failed'
  | 'alignment-failed';

export class PanoramaStitchError extends Error {
  constructor(
    message: string,
    readonly code: PanoramaFailureCode,
    /** Zero-based index of the first photo in the pair that failed, when relevant. */
    readonly pairIndex?: number,
    readonly reason?: RejectionReason,
  ) {
    super(message);
    this.name = 'PanoramaStitchError';
  }
}

export interface StitchOptions {
  onProgress?: (progress: PanoramaProgress) => void;
  signal?: AbortSignal;
}

interface Frame {
  work: ImageData;
  compose: ImageData;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Afbrudt', 'AbortError');
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older engines reject the options bag; EXIF is then applied by the decoder itself.
    return createImageBitmap(file);
  }
}

function drawScaled(bitmap: ImageBitmap, maxDimension: number): ImageData {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new PanoramaStitchError('Browseren kunne ikke behandle fotoet.', 'decode-failed');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Reads every photo once and keeps two scaled copies: a small one for feature matching and a
 * larger one for the actual composition. EXIF rotation is resolved during decode, so OpenCV
 * never sees a frame that is sideways relative to what the user saw in the preview.
 */
async function readFrames(files: File[], signal?: AbortSignal): Promise<Frame[]> {
  const frames: Frame[] = [];
  for (const file of files) {
    throwIfAborted(signal);
    let bitmap: ImageBitmap;
    try {
      bitmap = await decode(file);
    } catch {
      throw new PanoramaStitchError('Et af fotoene kunne ikke læses.', 'decode-failed');
    }
    try {
      frames.push({
        work: drawScaled(bitmap, WORK_MAX_DIMENSION),
        compose: drawScaled(bitmap, COMPOSE_MAX_DIMENSION),
      });
    } finally {
      bitmap.close();
    }
    await yieldToUi();
  }
  return frames;
}

interface Features {
  keypoints: { delete: () => void; size: () => number; get: (index: number) => { pt: { x: number; y: number } } };
  descriptors: Mat;
}

function detectFeatures(cv: OpenCv, image: ImageData): Features {
  let rgba: Mat | null = null;
  let gray: Mat | null = null;
  let mask: Mat | null = null;
  let orb: { detectAndCompute: (...args: never[]) => void; delete: () => void } | null = null;

  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();

  try {
    rgba = cv.matFromImageData(image);
    gray = new cv.Mat();
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    // Foliage is low-contrast and repetitive; equalising gives ORB more to hold on to.
    cv.equalizeHist(gray, gray);

    mask = new cv.Mat();
    orb = new cv.ORB(ORB_FEATURES) as unknown as typeof orb;
    (orb as unknown as { detectAndCompute: (a: Mat, b: Mat, c: unknown, d: Mat) => void })
      .detectAndCompute(gray, mask, keypoints, descriptors);

    return { keypoints: keypoints as unknown as Features['keypoints'], descriptors };
  } catch (error) {
    release(keypoints, descriptors);
    throw error;
  } finally {
    release(rgba, gray, mask, orb);
  }
}

interface PairResult {
  homography: Matrix3;
  goodMatches: number;
  inliers: number;
}

/**
 * Estimates the homography mapping `next` into `previous`, in working-image coordinates.
 * Returns null when the pair cannot be aligned with any confidence.
 */
function alignPair(
  cv: OpenCv,
  previous: Features,
  next: Features,
  size: { width: number; height: number },
): { result: PairResult | null; reason?: RejectionReason } {
  if (previous.descriptors.rows < 2 || next.descriptors.rows < 2) {
    return { result: null, reason: 'too-few-matches' };
  }

  let matcher: { knnMatch: (...args: never[]) => void; delete: () => void } | null = null;
  let matches: { size: () => number; get: (i: number) => { size: () => number; get: (j: number) => { queryIdx: number; trainIdx: number; distance: number } }; delete: () => void } | null = null;
  let srcPoints: Mat | null = null;
  let dstPoints: Mat | null = null;
  let inlierMask: Mat | null = null;
  let homography: Mat | null = null;

  try {
    matcher = new cv.BFMatcher(cv.NORM_HAMMING, false) as unknown as typeof matcher;
    matches = new cv.DMatchVectorVector() as unknown as typeof matches;
    // Query is the next frame, train is the previous one, so the homography maps next -> previous.
    (matcher as unknown as { knnMatch: (a: Mat, b: Mat, c: unknown, k: number) => void })
      .knnMatch(next.descriptors, previous.descriptors, matches, 2);

    const src: number[] = [];
    const dst: number[] = [];
    for (let i = 0; i < matches!.size(); i += 1) {
      const pair = matches!.get(i);
      if (pair.size() < 2) continue;
      const best = pair.get(0);
      const second = pair.get(1);
      // Lowe's ratio test, plus a hard ceiling that drops matches nothing could call similar.
      if (!(best.distance < LOWE_RATIO * second.distance) || best.distance > 72) continue;
      const from = next.keypoints.get(best.queryIdx).pt;
      const to = previous.keypoints.get(best.trainIdx).pt;
      src.push(from.x, from.y);
      dst.push(to.x, to.y);
    }

    const goodMatches = src.length / 2;
    if (goodMatches < DEFAULT_LIMITS.minGoodMatches) {
      return { result: null, reason: 'too-few-matches' };
    }

    srcPoints = cv.matFromArray(goodMatches, 1, cv.CV_32FC2, src);
    dstPoints = cv.matFromArray(goodMatches, 1, cv.CV_32FC2, dst);
    inlierMask = new cv.Mat();
    homography = cv.findHomography(srcPoints, dstPoints, cv.RANSAC, RANSAC_REPROJECTION_PX, inlierMask);

    if (!homography || homography.rows !== 3 || homography.cols !== 3) {
      return { result: null, reason: 'too-few-inliers' };
    }

    let inliers = 0;
    const maskData = inlierMask.data;
    for (let i = 0; i < maskData.length; i += 1) if (maskData[i]) inliers += 1;

    const values = Array.from(homography.data64F as Float64Array).slice(0, 9);
    const verdict = judgeHomography(values, size, { goodMatches, inliers });
    if (!verdict.ok) return { result: null, reason: verdict.reason };

    return { result: { homography: values, goodMatches, inliers } };
  } finally {
    release(matcher, matches, srcPoints, dstPoints, inlierMask, homography);
  }
}

/** Builds an RGBA copy whose alpha channel carries the feather weight for blending. */
function featheredCopy(image: ImageData): ImageData {
  const { width, height } = image;
  const out = new ImageData(width, height);
  const bandX = Math.max(1, width * FEATHER_X);
  const bandY = Math.max(1, height * FEATHER_Y);

  for (let y = 0; y < height; y += 1) {
    const wy = Math.min(1, Math.min(y + 0.5, height - 0.5 - y) / bandY);
    for (let x = 0; x < width; x += 1) {
      const wx = Math.min(1, Math.min(x + 0.5, width - 0.5 - x) / bandX);
      const weight = Math.max(0, Math.min(wx, wy));
      const offset = (y * width + x) * 4;
      out.data[offset] = image.data[offset];
      out.data[offset + 1] = image.data[offset + 1];
      out.data[offset + 2] = image.data[offset + 2];
      out.data[offset + 3] = Math.round(weight * 255);
    }
  }
  return out;
}

interface Composition {
  colour: Float32Array;
  weight: Float32Array;
  width: number;
  height: number;
}

/**
 * Warps each frame onto the shared canvas and accumulates colour weighted by the feather mask.
 * Dividing by the accumulated weight at the end gives a linear cross-fade through every overlap
 * instead of a hard seam, and leaves untouched pixels at weight zero so they can be cropped.
 */
async function compose(
  cv: OpenCv,
  frames: Frame[],
  transforms: Matrix3[],
  width: number,
  height: number,
  options: StitchOptions,
): Promise<Composition> {
  const colour = new Float32Array(width * height * 3);
  const weight = new Float32Array(width * height);

  for (let index = 0; index < frames.length; index += 1) {
    throwIfAborted(options.signal);
    options.onProgress?.({
      stage: 'composing',
      message: `Samler panorama ${index + 1}/${frames.length}…`,
      current: index + 1,
      total: frames.length,
    });
    await yieldToUi();

    let source: Mat | null = null;
    let matrix: Mat | null = null;
    let warped: Mat | null = null;

    try {
      source = cv.matFromImageData(featheredCopy(frames[index].compose));
      matrix = cv.matFromArray(3, 3, cv.CV_64F, transforms[index] as number[]);
      warped = new cv.Mat();
      cv.warpPerspective(
        source,
        warped,
        matrix,
        new cv.Size(width, height),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(0, 0, 0, 0),
      );

      const data = warped.data;
      for (let pixel = 0, offset = 0; pixel < weight.length; pixel += 1, offset += 4) {
        const alpha = data[offset + 3];
        if (alpha === 0) continue;
        const w = alpha / 255;
        const target = pixel * 3;
        colour[target] += data[offset] * w;
        colour[target + 1] += data[offset + 1] * w;
        colour[target + 2] += data[offset + 2] * w;
        weight[pixel] += w;
      }
    } finally {
      release(source, matrix, warped);
    }
  }

  return { colour, weight, width, height };
}

function toJpeg(composition: Composition): Promise<File> {
  const { colour, weight, width, height } = composition;

  const covered = contentBounds({ data: weight, width, height, threshold: COVERAGE_EPSILON });
  if (!covered) {
    throw new PanoramaStitchError('Panoramaet blev tomt.', 'alignment-failed');
  }
  const bounds = trimToSolid({ data: weight, width, height, threshold: COVERAGE_EPSILON }, covered);

  const cropWidth = Math.max(1, bounds.maxX - bounds.minX);
  const cropHeight = Math.max(1, bounds.maxY - bounds.minY);
  const out = new ImageData(cropWidth, cropHeight);

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const source = (y + bounds.minY) * width + (x + bounds.minX);
      const target = (y * cropWidth + x) * 4;
      const w = weight[source];
      if (w <= COVERAGE_EPSILON) {
        // Inside the crop but never painted: neutral rather than black.
        out.data[target] = 24;
        out.data[target + 1] = 26;
        out.data[target + 2] = 22;
        out.data[target + 3] = 255;
        continue;
      }
      const from = source * 3;
      out.data[target] = colour[from] / w;
      out.data[target + 1] = colour[from + 1] / w;
      out.data[target + 2] = colour[from + 2] / w;
      out.data[target + 3] = 255;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PanoramaStitchError('Browseren kunne ikke gemme panoramaet.', 'decode-failed');
  ctx.putImageData(out, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new PanoramaStitchError('Panoramaet kunne ikke gemmes.', 'decode-failed'));
        resolve(new File([blob], 'haveomraade-panorama.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Aligns and blends 2-6 overlapping left-to-right photos into a single panorama.
 *
 * Throws {@link PanoramaStitchError} rather than producing a mangled image: a pair that cannot
 * be aligned is reported with its index so the caller can name the two photos involved.
 */
export async function stitchPanorama(files: File[], options: StitchOptions = {}): Promise<File> {
  if (files.length < MIN_PANORAMA_PHOTOS) {
    throw new PanoramaStitchError('Et panorama kræver mindst to fotos.', 'too-few-photos');
  }
  if (files.length > MAX_PANORAMA_PHOTOS) {
    throw new PanoramaStitchError('Et panorama kan højst bruge seks fotos.', 'too-many-photos');
  }

  options.onProgress?.({ stage: 'engine', message: 'Gør klar…' });
  let cv: OpenCv;
  try {
    cv = await loadOpenCv();
  } catch {
    throw new PanoramaStitchError('Billedmotoren kunne ikke starte.', 'engine-unavailable');
  }

  options.onProgress?.({ stage: 'reading', message: 'Læser fotos…' });
  const frames = await readFrames(files, options.signal);

  const features: Features[] = [];
  const pairwise: Matrix3[] = [];

  try {
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(options.signal);
      options.onProgress?.({
        stage: 'matching',
        message: 'Finder overlap…',
        current: index + 1,
        total: frames.length,
      });
      await yieldToUi();
      features.push(detectFeatures(cv, frames[index].work));
    }

    for (let index = 0; index + 1 < frames.length; index += 1) {
      throwIfAborted(options.signal);
      options.onProgress?.({
        stage: 'matching',
        message: `Tilpasser billeder ${index + 1}/${frames.length - 1}…`,
        current: index + 1,
        total: frames.length - 1,
      });
      await yieldToUi();

      const work = frames[index].work;
      const { result, reason } = alignPair(cv, features[index], features[index + 1], work);
      if (!result) {
        if (import.meta.env.DEV) {
          console.warn(`[panorama] pair ${index + 1}-${index + 2} rejected:`, reason);
        }
        throw new PanoramaStitchError(
          `Vi kunne ikke finde nok overlap mellem foto ${index + 1} og ${index + 2}.`,
          'alignment-failed',
          index,
          reason,
        );
      }
      if (import.meta.env.DEV) {
        console.info(
          `[panorama] pair ${index + 1}-${index + 2}: ${result.inliers}/${result.goodMatches} inliers`,
        );
      }

      // Matching ran on the work copy; warping happens on the larger compose copy.
      const factor = frames[index].compose.width / work.width;
      pairwise.push(rescaleHomography(result.homography, factor));
    }
  } finally {
    for (const item of features) release(item.keypoints, item.descriptors);
  }

  const layout = planCanvas(
    accumulate(pairwise),
    frames.map((frame) => ({ width: frame.compose.width, height: frame.compose.height })),
    CANVAS_LIMITS,
  );

  const composition = await compose(cv, frames, layout.transforms, layout.width, layout.height, options);

  options.onProgress?.({ stage: 'encoding', message: 'Gør billedet klar…' });
  await yieldToUi();
  return toJpeg(composition);
}
