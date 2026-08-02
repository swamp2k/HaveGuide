import { describe, expect, it } from 'vitest';
import { closePolygon, geometrySchema } from '../../src/shared/geojson';

describe('GeoJSON validation', () => {
  it('accepts a valid point', () => {
    expect(geometrySchema.safeParse({ type: 'Point', coordinates: [10.2, 56.1] }).success).toBe(true);
  });

  it('rejects coordinates outside the globe', () => {
    expect(geometrySchema.safeParse({ type: 'Point', coordinates: [300, 56.1] }).success).toBe(false);
  });

  it('closes a polygon exactly once', () => {
    const ring = closePolygon([
      [10, 56],
      [10.1, 56],
      [10.1, 56.1],
    ]);
    expect(ring).toEqual([
      [10, 56],
      [10.1, 56],
      [10.1, 56.1],
      [10, 56],
    ]);
    expect(closePolygon(ring)).toEqual(ring);
  });

  it('requires a closed polygon ring', () => {
    expect(
      geometrySchema.safeParse({
        type: 'Polygon',
        coordinates: [[[10, 56], [10.1, 56], [10.1, 56.1], [10.2, 56.2]]],
      }).success,
    ).toBe(false);
  });
});
