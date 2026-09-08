import { describe, expect, it } from 'vitest';
import { describeProfile, EMPTY_PROFILE, isKnownCondition, isProfileComplete } from '../../src/shared/profile';

describe('isProfileComplete', () => {
  it('requires the four useful growing-condition fields', () => {
    expect(isProfileComplete(EMPTY_PROFILE)).toBe(false);
    expect(isProfileComplete({ ...EMPTY_PROFILE, sun: 'full_sun', moisture: 'normal', soil: 'loam', drainage: 'normal' })).toBe(true);
  });
});

describe('describeProfile', () => {
  it('renders the profile as Danish labels under an explicit heading', () => {
    const text = describeProfile({
      sun: 'full_sun',
      moisture: 'moist',
      soil: 'loam',
      drainage: 'normal',
      wind: 'sheltered',
      notes: 'står under æbletræet',
      goals: ['Lav vedligeholdelse', 'Bestøvere'],
    });

    expect(text).toBe(
      [
        'BRUGERENS OPLYSTE FORHOLD',
        'Disse oplysninger kommer direkte fra brugeren og skal behandles som kendte forhold:',
        '',
        '- Sol: Fuld sol',
        '- Fugt: Fugtigt',
        '- Jord: Muldjord',
        '- Dræn: Normalt dræn',
        '- Vind: Læ',
        '- Ønsker: Lav vedligeholdelse, Bestøvere',
        '- Noter: står under æbletræet',
      ].join('\n'),
    );
  });

  it('separates a missing field from an explicit "Ved ikke"', () => {
    const text = describeProfile({ ...EMPTY_PROFILE, soil: 'unknown', drainage: 'unknown' });

    expect(text).toContain('- Sol: Ikke oplyst');
    expect(text).toContain('- Jord: Ved ikke');
    expect(text).toContain('- Dræn: Ved ikke');
    expect(text).toContain('- Ønsker: Ikke oplyst');
    expect(text).toContain('- Noter: Ikke oplyst');
  });

  it('does not leak raw enum values into the prompt', () => {
    const text = describeProfile({ ...EMPTY_PROFILE, sun: 'part_sun', moisture: 'wet' });

    expect(text).not.toContain('part_sun');
    expect(text).not.toContain('wet');
  });
});

describe('isKnownCondition', () => {
  it('counts only a real user choice as known', () => {
    expect(isKnownCondition('loam')).toBe(true);
    expect(isKnownCondition('unknown')).toBe(false);
    expect(isKnownCondition(null)).toBe(false);
  });
});
