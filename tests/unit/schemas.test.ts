import { describe, expect, it } from 'vitest';
import { identificationUpdateSchema, identifyPlantSchema } from '../../src/shared/schemas';

describe('identificationUpdateSchema', () => {
  it('accepts a partial plant-card edit', () => {
    const parsed = identificationUpdateSchema.safeParse({ nickname: '  Den lilla bagest  ' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.nickname).toBe('Den lilla bagest');
  });

  it('accepts toggling a plant out of the AI context', () => {
    expect(identificationUpdateSchema.safeParse({ includeInAnalysis: false }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(identificationUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a suggestion index outside the PlantNet result range', () => {
    expect(identificationUpdateSchema.safeParse({ selectedSuggestionIndex: 5 }).success).toBe(false);
    expect(identificationUpdateSchema.safeParse({ selectedSuggestionIndex: 2 }).success).toBe(true);
  });

  it('rejects an over-long nickname', () => {
    expect(identificationUpdateSchema.safeParse({ nickname: 'x'.repeat(61) }).success).toBe(false);
  });
});

describe('identifyPlantSchema', () => {
  it('carries optional labels from the capture flow', () => {
    const parsed = identifyPlantSchema.safeParse({ imageId: 'img-1', organ: 'flower', nickname: 'Ved stenen' });
    expect(parsed.success && parsed.data).toMatchObject({ organ: 'flower', nickname: 'Ved stenen' });
  });

  it('defaults the organ to auto', () => {
    const parsed = identifyPlantSchema.safeParse({ imageId: 'img-1' });
    expect(parsed.success && parsed.data.organ).toBe('auto');
  });
});
