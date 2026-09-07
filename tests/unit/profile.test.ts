import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, isProfileComplete } from '../../src/shared/profile';

describe('isProfileComplete', () => {
  it('requires the four useful growing-condition fields', () => {
    expect(isProfileComplete(EMPTY_PROFILE)).toBe(false);
    expect(isProfileComplete({ ...EMPTY_PROFILE, sun: 'full_sun', moisture: 'normal', soil: 'loam', drainage: 'normal' })).toBe(true);
  });
});
