import { describe, expect, it } from 'vitest';
import { generateDesignOptions } from '../../src/shared/design-engine';
import type { DesignConstraints, PlantCatalogEntry } from '../../src/shared/types';

const baseConstraints: DesignConstraints = {
  effort: 'low',
  budget: 'flexible',
  childrenUseGarden: true,
  petsUseGarden: true,
  avoidPotentiallyHarmful: true,
  colors: [],
  maxHeightCm: null,
  winterInterest: false,
  notes: '',
};

function plant(id: string, overrides: Partial<PlantCatalogEntry> = {}): PlantCatalogEntry {
  return {
    id,
    commonName: id,
    scientificName: `Species ${id}`,
    category: 'perennial',
    sun: ['sun'],
    moisture: ['normal'],
    soil: ['loam'],
    maintenanceLevel: 1,
    heightCm: 50,
    spreadCm: 40,
    evergreen: false,
    colors: ['purple'],
    floweringMonths: [6, 7, 8],
    biodiversityScore: 4,
    slopeSuitable: true,
    privacySuitable: false,
    safety: 'low_risk',
    safetyNote: 'Test note',
    sourceLabel: 'Test source',
    sourceUrl: '',
    ...overrides,
  };
}

const catalog = [
  plant('a'),
  plant('b', { category: 'groundcover', heightCm: 12 }),
  plant('c', { biodiversityScore: 5 }),
  plant('d', { evergreen: true, category: 'grass', heightCm: 120 }),
  plant('e', { privacySuitable: true, category: 'hedge', heightCm: 180 }),
  plant('toxic', { safety: 'avoid', commonName: 'Hortensia' }),
];

describe('design engine', () => {
  it('creates three explainable alternatives', () => {
    const options = generateDesignOptions({
      goal: 'low_maintenance',
      constraints: baseConstraints,
      targetFeatureType: 'bed',
      assessments: [{ category: 'sun', value: 'Fuld sol', notes: '' }],
      catalog,
      inspiration: null,
    });
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.position)).toEqual([1, 2, 3]);
    expect(options.every((option) => option.ruleTrace.length >= 3)).toBe(true);
    expect(options.every((option) => option.workItems.length >= 4)).toBe(true);
  });

  it('removes avoid-plants when children and pets use the area', () => {
    const options = generateDesignOptions({
      goal: 'flowers',
      constraints: baseConstraints,
      targetFeatureType: 'bed',
      assessments: [],
      catalog,
      inspiration: null,
    });
    expect(options.flatMap((option) => option.plants).some((item) => item.catalogId === 'toxic')).toBe(false);
  });

  it('adds slope stabilisation to a slope plan', () => {
    const options = generateDesignOptions({
      goal: 'slope',
      constraints: baseConstraints,
      targetFeatureType: 'slope',
      assessments: [{ category: 'slope', value: 'Stejl skrænt', notes: '' }],
      catalog,
      inspiration: null,
    });
    expect(options[0]?.workItems.some((item) => item.title.includes('Stabilisér'))).toBe(true);
    expect(options[0]?.ruleTrace.some((item) => item.includes('skrænt'))).toBe(true);
  });
});
