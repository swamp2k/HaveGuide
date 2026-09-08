/**
 * Pure geometry helpers for panorama stitching.
 *
 * Everything here is plain arithmetic on 3x3 row-major homographies, deliberately kept free of
 * OpenCV so the tricky parts — cumulative transforms, bounds, sanity checks — can be unit tested
 * without a WASM runtime.
 */

/** Row-major 3x3: [m00, m01, m02, m10, m11, m12, m20, m21, m22]. */
export type Matrix3 = readonly number[];

export const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
}

export function applyToPoint(h: Matrix3, point: Point): Point {
  const w = h[6] * point.x + h[7] * point.y + h[8];
  const safeW = Math.abs(w) < 1e-12 ? 1e-12 : w;
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / safeW,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / safeW,
  };
}

export function translation(dx: number, dy: number): Matrix3 {
  return [1, 0, dx, 0, 1, dy, 0, 0, 1];
}

export function scaling(factor: number): Matrix3 {
  return [factor, 0, 0, 0, factor, 0, 0, 0, 1];
}

/**
 * Re-expresses a homography measured on downscaled images so it applies to full-size images.
 * Feature matching runs on small copies; warping runs on larger ones.
 */
export function rescaleHomography(h: Matrix3, factor: number): Matrix3 {
  if (factor === 1) return h;
  return multiply(scaling(factor), multiply(h, scaling(1 / factor)));
}

export function corners(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

export function transformedCorners(h: Matrix3, width: number, height: number): Point[] {
  return corners(width, height).map((point) => applyToPoint(h, point));
}

export function boundsOf(points: Point[]): Bounds {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Chains pairwise homographies into absolute ones in the first image's frame.
 *
 * `pairwise[i]` maps image i+1 into image i. The first image is the reference, so
 * H0 = I, H1 = pairwise[0], H2 = pairwise[0] * pairwise[1], ...
 */
export function accumulate(pairwise: Matrix3[]): Matrix3[] {
  const absolute: Matrix3[] = [IDENTITY];
  for (const relative of pairwise) {
    absolute.push(multiply(absolute[absolute.length - 1], relative));
  }
  return absolute;
}

export interface PanoramaLayout {
  /** Per-image homography including the offset that pushes everything positive. */
  transforms: Matrix3[];
  width: number;
  height: number;
  /** Uniform downscale applied to keep the canvas within the pixel budget. */
  scale: number;
}

/**
 * Works out the canvas every warped image lands on: the union of all transformed corners,
 * shifted so nothing is negative, then scaled down if the result would be unreasonably large.
 */
export function planCanvas(
  absolute: Matrix3[],
  sizes: Array<{ width: number; height: number }>,
  limits: { maxWidth: number; maxHeight: number; maxPixels?: number },
): PanoramaLayout {
  const allCorners = absolute.flatMap((h, index) => {
    const size = sizes[index];
    return size ? transformedCorners(h, size.width, size.height) : [];
  });
  const bounds = boundsOf(allCorners);

  const rawWidth = Math.max(1, Math.ceil(bounds.maxX - bounds.minX));
  const rawHeight = Math.max(1, Math.ceil(bounds.maxY - bounds.minY));
  // A pixel budget matters as much as the width cap: blending keeps float accumulators for the
  // whole canvas, and a phone will not survive an unbounded one.
  const pixelScale = limits.maxPixels
    ? Math.sqrt(limits.maxPixels / (rawWidth * rawHeight))
    : 1;
  const scale = Math.min(1, limits.maxWidth / rawWidth, limits.maxHeight / rawHeight, pixelScale);

  const offset = multiply(scaling(scale), translation(-bounds.minX, -bounds.minY));
  return {
    transforms: absolute.map((h) => multiply(offset, h)),
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
    scale,
  };
}

export interface HomographyStats {
  /** Mean of the two singular-value-ish axis lengths of the linear part. */
  scale: number;
  /** Rotation of the x axis, in degrees. */
  rotationDeg: number;
  /** How far the linear part is from being a similarity transform. */
  shear: number;
  /** Strength of the projective row; large values mean extreme perspective. */
  perspective: number;
  /** Where the source image centre lands, relative to its own frame. */
  translationX: number;
  translationY: number;
}

export function describeHomography(h: Matrix3, width: number, height: number): HomographyStats {
  const scaleX = Math.hypot(h[0], h[3]);
  const scaleY = Math.hypot(h[1], h[4]);
  const centre = { x: width / 2, y: height / 2 };
  const mapped = applyToPoint(h, centre);
  // Dot product of the two column directions: 0 for a pure rotation+scale.
  const shear = Math.abs(h[0] * h[1] + h[3] * h[4]) / Math.max(1e-9, scaleX * scaleY);

  return {
    scale: (scaleX + scaleY) / 2,
    rotationDeg: (Math.atan2(h[3], h[0]) * 180) / Math.PI,
    shear,
    perspective: Math.hypot(h[6], h[7]) * Math.max(width, height),
    translationX: mapped.x - centre.x,
    translationY: mapped.y - centre.y,
  };
}

export interface MatchQuality {
  goodMatches: number;
  inliers: number;
}

export interface HomographyLimits {
  minGoodMatches: number;
  minInliers: number;
  minInlierRatio: number;
  maxScaleChange: number;
  maxRotationDeg: number;
  maxShear: number;
  maxPerspective: number;
  /** Vertical drift is bounded relative to frame height; hand-held tilt is expected, flips are not. */
  maxVerticalDriftRatio: number;
  /** The capture flow is explicitly left-to-right, so the next frame must sit to the right. */
  minHorizontalShiftRatio: number;
  maxHorizontalShiftRatio: number;
}

export const DEFAULT_LIMITS: HomographyLimits = {
  minGoodMatches: 16,
  minInliers: 12,
  minInlierRatio: 0.25,
  maxScaleChange: 1.6,
  maxRotationDeg: 25,
  maxShear: 0.45,
  maxPerspective: 0.75,
  maxVerticalDriftRatio: 0.5,
  minHorizontalShiftRatio: 0.04,
  maxHorizontalShiftRatio: 1.15,
};

export type RejectionReason =
  | 'too-few-matches'
  | 'too-few-inliers'
  | 'low-inlier-ratio'
  | 'scale-change'
  | 'rotation'
  | 'shear'
  | 'perspective'
  | 'vertical-drift'
  | 'wrong-direction'
  | 'too-far';

export interface HomographyVerdict {
  ok: boolean;
  reason?: RejectionReason;
  stats: HomographyStats;
}

/**
 * Decides whether a pairwise homography is trustworthy enough to build a panorama on.
 *
 * `h` maps the *next* image into the *previous* image's frame. Because capture goes
 * left to right, the next frame's centre must land to the right of the previous frame's
 * centre — a solution that puts it to the left, or halfway across the world, is nonsense
 * from repeating foliage rather than a real alignment.
 */
export function judgeHomography(
  h: Matrix3,
  size: { width: number; height: number },
  quality: MatchQuality,
  limits: HomographyLimits = DEFAULT_LIMITS,
): HomographyVerdict {
  const stats = describeHomography(h, size.width, size.height);
  const fail = (reason: RejectionReason): HomographyVerdict => ({ ok: false, reason, stats });

  if (quality.goodMatches < limits.minGoodMatches) return fail('too-few-matches');
  if (quality.inliers < limits.minInliers) return fail('too-few-inliers');
  if (quality.inliers / Math.max(1, quality.goodMatches) < limits.minInlierRatio) {
    return fail('low-inlier-ratio');
  }

  const scaleChange = stats.scale >= 1 ? stats.scale : 1 / Math.max(1e-6, stats.scale);
  if (!Number.isFinite(scaleChange) || scaleChange > limits.maxScaleChange) return fail('scale-change');
  if (Math.abs(stats.rotationDeg) > limits.maxRotationDeg) return fail('rotation');
  if (stats.shear > limits.maxShear) return fail('shear');
  if (stats.perspective > limits.maxPerspective) return fail('perspective');
  if (Math.abs(stats.translationY) > size.height * limits.maxVerticalDriftRatio) {
    return fail('vertical-drift');
  }

  const shiftRatio = stats.translationX / size.width;
  if (shiftRatio < limits.minHorizontalShiftRatio) return fail('wrong-direction');
  if (shiftRatio > limits.maxHorizontalShiftRatio) return fail('too-far');

  return { ok: true, stats };
}

export interface CoverageMask {
  /** Row-major, one entry per pixel; > 0 means the pixel was painted by some frame. */
  data: Float32Array | Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  /** Values at or below this count as empty. */
  threshold: number;
}

/**
 * Tightest rectangle containing every covered pixel.
 * Used to drop the empty margin that warping leaves around the panorama.
 */
export function contentBounds(mask: CoverageMask): Bounds | null {
  const { data, width, height, threshold } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
}

function edgeCoverage(mask: CoverageMask, bounds: Bounds, edge: 'top' | 'bottom' | 'left' | 'right'): number {
  const { data, width, threshold } = mask;
  let covered = 0;
  let total = 0;

  if (edge === 'top' || edge === 'bottom') {
    const y = edge === 'top' ? bounds.minY : bounds.maxY - 1;
    for (let x = bounds.minX; x < bounds.maxX; x += 1) {
      total += 1;
      if (data[y * width + x] > threshold) covered += 1;
    }
  } else {
    const x = edge === 'left' ? bounds.minX : bounds.maxX - 1;
    for (let y = bounds.minY; y < bounds.maxY; y += 1) {
      total += 1;
      if (data[y * width + x] > threshold) covered += 1;
    }
  }

  return total === 0 ? 0 : covered / total;
}

/**
 * Shrinks a bounding box until its edges are (nearly) fully covered, so the empty wedges that
 * a rotated warp leaves in the corners get trimmed instead of showing up as black triangles.
 *
 * Trimming is capped so a slightly ragged panorama loses a border rather than most of itself.
 */
export function trimToSolid(
  mask: CoverageMask,
  start: Bounds,
  options: { minCoverage?: number; maxTrimRatio?: number } = {},
): Bounds {
  const minCoverage = options.minCoverage ?? 0.985;
  const maxTrimRatio = options.maxTrimRatio ?? 0.2;

  const startWidth = start.maxX - start.minX;
  const startHeight = start.maxY - start.minY;
  const minWidth = Math.max(1, Math.floor(startWidth * (1 - maxTrimRatio)));
  const minHeight = Math.max(1, Math.floor(startHeight * (1 - maxTrimRatio)));

  const bounds: Bounds = { ...start };

  // Trim whichever edge is worst, one pixel at a time, until every edge is solid enough.
  for (let step = 0; step < startWidth + startHeight; step += 1) {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    const candidates: Array<{ edge: 'top' | 'bottom' | 'left' | 'right'; coverage: number }> = [];
    if (height > minHeight) {
      candidates.push({ edge: 'top', coverage: edgeCoverage(mask, bounds, 'top') });
      candidates.push({ edge: 'bottom', coverage: edgeCoverage(mask, bounds, 'bottom') });
    }
    if (width > minWidth) {
      candidates.push({ edge: 'left', coverage: edgeCoverage(mask, bounds, 'left') });
      candidates.push({ edge: 'right', coverage: edgeCoverage(mask, bounds, 'right') });
    }

    const worst = candidates.sort((a, b) => a.coverage - b.coverage)[0];
    if (!worst || worst.coverage >= minCoverage) break;

    if (worst.edge === 'top') bounds.minY += 1;
    else if (worst.edge === 'bottom') bounds.maxY -= 1;
    else if (worst.edge === 'left') bounds.minX += 1;
    else bounds.maxX -= 1;
  }

  return bounds;
}
