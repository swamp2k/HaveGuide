import { describe, expect, it } from 'vitest';
import { calculateCompleteness } from '../../src/shared/completeness';

describe('garden completeness', () => {
  it('starts at zero for an empty garden', () => {
    const result = calculateCompleteness({ featureCount: 0, hasBoundary: false, mediaCount: 0, plantCount: 0, assessmentCategoryCount: 0, observationCount: 0, walkCompleted: false });
    expect(result.percent).toBe(0);
    expect(result.missing).toHaveLength(6);
  });

  it('reaches one hundred when all checkpoints are met', () => {
    const result = calculateCompleteness({ featureCount: 4, hasBoundary: true, mediaCount: 3, plantCount: 2, assessmentCategoryCount: 3, observationCount: 1, walkCompleted: true });
    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it('counts each checkpoint equally', () => {
    const result = calculateCompleteness({ featureCount: 4, hasBoundary: true, mediaCount: 3, plantCount: 0, assessmentCategoryCount: 0, observationCount: 0, walkCompleted: false });
    expect(result.percent).toBe(33);
  });
});
