import { describe, expect, it } from 'vitest';
import { createObservationSchema, createPlantSchema, linkPlantMediaSchema } from '../../src/shared/schemas';

describe('garden understanding schemas', () => {
  it('requires coordinates in pairs', () => {
    expect(createObservationSchema.safeParse({ kind: 'problem', title: 'Vådt område', latitude: 56, environment: {} }).success).toBe(false);
  });

  it('supports a manually named plant without a photo', () => {
    expect(createPlantSchema.safeParse({ commonName: 'Syren', identificationStatus: 'manual', confidence: 'likely' }).success).toBe(true);
  });

  it('validates plant organs', () => {
    expect(linkPlantMediaSchema.safeParse({ mediaId: '414945bc-ad9e-484e-bfa6-59a05980b6cc', organ: 'leaf' }).success).toBe(true);
    expect(linkPlantMediaSchema.safeParse({ mediaId: '414945bc-ad9e-484e-bfa6-59a05980b6cc', organ: 'root' }).success).toBe(false);
  });
});
