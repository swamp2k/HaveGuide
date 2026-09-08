import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMITS,
  IDENTITY,
  accumulate,
  applyToPoint,
  boundsOf,
  contentBounds,
  describeHomography,
  judgeHomography,
  multiply,
  planCanvas,
  rescaleHomography,
  transformedCorners,
  translation,
  trimToSolid,
  type Matrix3,
} from '../../src/client/panorama/geometry';

const FRAME = { width: 1200, height: 1600 };

/** A clean left-to-right pan: the next frame sits `shift` px to the right of the previous one. */
function pan(shift: number): Matrix3 {
  return translation(shift, 0);
}

function goodQuality() {
  return { goodMatches: 120, inliers: 90 };
}

describe('matrix maths', () => {
  it('multiplies row-major matrices', () => {
    expect(multiply(IDENTITY, translation(5, 7))).toEqual(translation(5, 7));
    expect(multiply(translation(5, 0), translation(3, 2))).toEqual(translation(8, 2));
  });

  it('applies a homography to a point, dividing by w', () => {
    expect(applyToPoint(translation(10, -4), { x: 1, y: 1 })).toEqual({ x: 11, y: -3 });
    const projective: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 2];
    expect(applyToPoint(projective, { x: 4, y: 6 })).toEqual({ x: 2, y: 3 });
  });

  it('rescales a homography between working and composition resolutions', () => {
    // A 100px shift measured on a half-size image is a 200px shift at full size.
    const rescaled = rescaleHomography(translation(100, 0), 2);
    expect(applyToPoint(rescaled, { x: 0, y: 0 })).toEqual({ x: 200, y: 0 });
  });

  it('leaves a homography alone at scale 1', () => {
    expect(rescaleHomography(translation(3, 4), 1)).toEqual(translation(3, 4));
  });
});

describe('accumulate', () => {
  it('chains pairwise transforms into the first frame', () => {
    const absolute = accumulate([pan(800), pan(760), pan(820)]);
    expect(absolute).toHaveLength(4);
    expect(absolute[0]).toEqual(IDENTITY);
    // Frame 4 sits at the sum of the three hops, not just the last one.
    expect(applyToPoint(absolute[3], { x: 0, y: 0 }).x).toBeCloseTo(2380);
  });

  it('returns just the reference frame for a single image', () => {
    expect(accumulate([])).toEqual([IDENTITY]);
  });
});

describe('planCanvas', () => {
  const sizes = [FRAME, FRAME, FRAME];

  it('covers every frame and shifts everything positive', () => {
    const layout = planCanvas(accumulate([pan(800), pan(800)]), sizes, {
      maxWidth: 7200,
      maxHeight: 1800,
    });
    // 1200 wide frames at 0, 800, 1600 span 0..2800.
    expect(layout.width).toBe(2800);
    expect(layout.height).toBe(1600);
    expect(layout.scale).toBe(1);

    const allCorners = layout.transforms.flatMap((h) => transformedCorners(h, FRAME.width, FRAME.height));
    const bounds = boundsOf(allCorners);
    expect(bounds.minX).toBeCloseTo(0);
    expect(bounds.minY).toBeCloseTo(0);
  });

  it('shifts negative coordinates into the canvas', () => {
    // A pair that drifts upward puts corners above y=0 before the offset is applied.
    const layout = planCanvas([IDENTITY, translation(800, -200)], [FRAME, FRAME], {
      maxWidth: 7200,
      maxHeight: 1800,
    });
    const bounds = boundsOf(
      layout.transforms.flatMap((h) => transformedCorners(h, FRAME.width, FRAME.height)),
    );
    expect(bounds.minX).toBeCloseTo(0);
    expect(bounds.minY).toBeCloseTo(0);
    expect(layout.height).toBe(1800);
  });

  it('scales down to respect the width cap', () => {
    const layout = planCanvas(accumulate([pan(1100), pan(1100), pan(1100), pan(1100), pan(1100)]),
      new Array(6).fill(FRAME),
      { maxWidth: 3000, maxHeight: 4000 });
    expect(layout.width).toBeLessThanOrEqual(3000);
    expect(layout.scale).toBeLessThan(1);
  });

  it('respects a pixel budget even when width and height fit', () => {
    const unbudgeted = planCanvas(accumulate([pan(1000), pan(1000), pan(1000)]), new Array(4).fill(FRAME), {
      maxWidth: 7200,
      maxHeight: 1800,
    });
    const budgeted = planCanvas(accumulate([pan(1000), pan(1000), pan(1000)]), new Array(4).fill(FRAME), {
      maxWidth: 7200,
      maxHeight: 1800,
      maxPixels: 1_000_000,
    });
    expect(unbudgeted.width * unbudgeted.height).toBeGreaterThan(1_000_000);
    expect(budgeted.width * budgeted.height).toBeLessThanOrEqual(1_100_000);
  });
});

describe('describeHomography', () => {
  it('reads off a pure translation', () => {
    const stats = describeHomography(pan(400), FRAME.width, FRAME.height);
    expect(stats.scale).toBeCloseTo(1);
    expect(stats.rotationDeg).toBeCloseTo(0);
    expect(stats.translationX).toBeCloseTo(400);
    expect(stats.translationY).toBeCloseTo(0);
  });

  it('reads off a rotation', () => {
    const radians = (10 * Math.PI) / 180;
    const rotation: Matrix3 = [
      Math.cos(radians), -Math.sin(radians), 0,
      Math.sin(radians), Math.cos(radians), 0,
      0, 0, 1,
    ];
    expect(describeHomography(rotation, FRAME.width, FRAME.height).rotationDeg).toBeCloseTo(10);
  });
});

describe('judgeHomography', () => {
  it('accepts a clean left-to-right pan with strong support', () => {
    const verdict = judgeHomography(pan(700), FRAME, goodQuality());
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  it('rejects a pan that goes the wrong way', () => {
    // Capture is explicitly left to right, so a leftward solution is nonsense.
    expect(judgeHomography(pan(-700), FRAME, goodQuality())).toMatchObject({
      ok: false,
      reason: 'wrong-direction',
    });
  });

  it('rejects a frame that barely moved', () => {
    expect(judgeHomography(pan(10), FRAME, goodQuality())).toMatchObject({
      ok: false,
      reason: 'wrong-direction',
    });
  });

  it('rejects a jump far beyond one frame width', () => {
    expect(judgeHomography(pan(2400), FRAME, goodQuality())).toMatchObject({
      ok: false,
      reason: 'too-far',
    });
  });

  it('rejects an absurd scale change', () => {
    const blownUp = multiply(pan(700), [2.5, 0, 0, 0, 2.5, 0, 0, 0, 1]);
    expect(judgeHomography(blownUp, FRAME, goodQuality())).toMatchObject({
      ok: false,
      reason: 'scale-change',
    });
  });

  it('rejects excessive rotation', () => {
    const radians = (40 * Math.PI) / 180;
    const rotated = multiply(pan(700), [
      Math.cos(radians), -Math.sin(radians), 0,
      Math.sin(radians), Math.cos(radians), 0,
      0, 0, 1,
    ]);
    expect(judgeHomography(rotated, FRAME, goodQuality())).toMatchObject({ ok: false, reason: 'rotation' });
  });

  it('rejects extreme perspective', () => {
    const projective: Matrix3 = [1, 0, 700, 0, 1, 0, 0.002, 0.002, 1];
    expect(judgeHomography(projective, FRAME, goodQuality())).toMatchObject({
      ok: false,
      reason: 'perspective',
    });
  });

  it('rejects a solution that slides the frame vertically off the strip', () => {
    expect(judgeHomography(translation(700, 1000), FRAME, goodQuality())).toMatchObject({
      ok: false,
      reason: 'vertical-drift',
    });
  });

  it('rejects thin match support before it looks at geometry', () => {
    expect(judgeHomography(pan(700), FRAME, { goodMatches: 8, inliers: 8 })).toMatchObject({
      ok: false,
      reason: 'too-few-matches',
    });
    expect(judgeHomography(pan(700), FRAME, { goodMatches: 40, inliers: 5 })).toMatchObject({
      ok: false,
      reason: 'too-few-inliers',
    });
  });

  it('rejects a homography most of whose matches disagree with it', () => {
    // Repeating foliage produces many matches but few that any single transform explains.
    expect(judgeHomography(pan(700), FRAME, { goodMatches: 200, inliers: 20 })).toMatchObject({
      ok: false,
      reason: 'low-inlier-ratio',
    });
  });

  it('uses limits that leave room for ordinary hand-held capture', () => {
    expect(DEFAULT_LIMITS.maxRotationDeg).toBeGreaterThanOrEqual(15);
    const handHeld = multiply(translation(680, 40), [
      Math.cos(0.06), -Math.sin(0.06), 0,
      Math.sin(0.06), Math.cos(0.06), 0,
      0, 0, 1,
    ]);
    expect(judgeHomography(handHeld, FRAME, { goodMatches: 60, inliers: 34 }).ok).toBe(true);
  });
});

describe('crop helpers', () => {
  /** Builds a coverage mask with an inset solid rectangle. */
  function maskWithRect(width: number, height: number, rect: { x: number; y: number; w: number; h: number }) {
    const data = new Float32Array(width * height);
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) data[y * width + x] = 1;
    }
    return { data, width, height, threshold: 0.004 };
  }

  it('finds the bounds of painted pixels', () => {
    const mask = maskWithRect(20, 10, { x: 3, y: 2, w: 9, h: 5 });
    expect(contentBounds(mask)).toEqual({ minX: 3, minY: 2, maxX: 12, maxY: 7 });
  });

  it('returns null for an empty canvas', () => {
    expect(contentBounds({ data: new Float32Array(40), width: 8, height: 5, threshold: 0.004 })).toBeNull();
  });

  it('trims corner wedges left by a rotated warp', () => {
    // Solid block with one corner pixel column missing, as a warp would leave it.
    const mask = maskWithRect(20, 10, { x: 0, y: 0, w: 20, h: 10 });
    for (let y = 0; y < 4; y += 1) mask.data[y * 20] = 0;

    const start = contentBounds(mask)!;
    expect(start).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 10 });

    const trimmed = trimToSolid(mask, start);
    expect(trimmed.minX).toBe(1);
    expect(trimmed.maxX).toBe(20);
  });

  it('leaves an already-solid rectangle untouched', () => {
    const mask = maskWithRect(12, 6, { x: 0, y: 0, w: 12, h: 6 });
    const start = contentBounds(mask)!;
    expect(trimToSolid(mask, start)).toEqual(start);
  });

  it('refuses to trim away most of the panorama', () => {
    // A badly ragged mask should cost a border, not the image.
    const mask = maskWithRect(20, 10, { x: 0, y: 0, w: 20, h: 10 });
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 20; x += 1) if ((x + y) % 3 === 0) mask.data[y * 20 + x] = 0;
    }
    const trimmed = trimToSolid(mask, contentBounds(mask)!, { maxTrimRatio: 0.2 });
    expect(trimmed.maxX - trimmed.minX).toBeGreaterThanOrEqual(16);
    expect(trimmed.maxY - trimmed.minY).toBeGreaterThanOrEqual(8);
  });
});
