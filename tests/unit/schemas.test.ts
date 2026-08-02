import { describe, expect, it } from 'vitest';
import { createFeatureSchema, createGardenSchema, credentialsSchema } from '../../src/shared/schemas';

describe('input schemas', () => {
  it('requires a meaningful password', () => {
    expect(credentialsSchema.safeParse({ username: 'martin', password: 'kort' }).success).toBe(false);
  });

  it('accepts a manually placed garden', () => {
    expect(
      createGardenSchema.safeParse({
        name: 'Hjemme',
        address: '',
        notes: '',
        centerLat: 56.2,
        centerLng: 10.7,
      }).success,
    ).toBe(true);
  });

  it('rejects invalid feature geometry', () => {
    expect(
      createFeatureSchema.safeParse({
        type: 'tree',
        name: 'Æbletræ',
        description: '',
        confidence: 'certain',
        geometry: { type: 'LineString', coordinates: [[10, 56]] },
      }).success,
    ).toBe(false);
  });
});
