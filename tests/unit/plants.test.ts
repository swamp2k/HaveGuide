import { describe, expect, it } from 'vitest';
import type { PlantIdentification, PlantSuggestion } from '../../src/shared/types';
import {
  knownPlantsForAnalysis,
  plantCardSubtitle,
  plantCardTitle,
  selectedSuggestion,
} from '../../src/shared/plants';

function suggestion(overrides: Partial<PlantSuggestion> = {}): PlantSuggestion {
  return { scientificName: 'Lavandula angustifolia', commonName: 'Lavendel', score: 0.89, gbifId: null, ...overrides };
}

function identification(overrides: Partial<PlantIdentification> = {}): PlantIdentification {
  return {
    id: 'id-1',
    sceneId: 'scene-1',
    imageId: 'image-1',
    organ: 'auto',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: null,
    suggestions: [suggestion()],
    selectedSuggestionIndex: 0,
    nickname: '',
    note: '',
    includeInAnalysis: true,
    image: null,
    ...overrides,
  };
}

describe('selectedSuggestion', () => {
  it('follows the chosen index', () => {
    const item = identification({
      suggestions: [suggestion(), suggestion({ scientificName: 'Salvia nemorosa', commonName: 'Salvie', score: 0.4 })],
      selectedSuggestionIndex: 1,
    });
    expect(selectedSuggestion(item)?.commonName).toBe('Salvie');
  });

  it('falls back to the best suggestion when the index is out of range', () => {
    expect(selectedSuggestion(identification({ selectedSuggestionIndex: 4 }))?.commonName).toBe('Lavendel');
  });

  it('returns null without suggestions', () => {
    expect(selectedSuggestion(identification({ suggestions: [] }))).toBeNull();
  });
});

describe('plant card labels', () => {
  it('titles the card with the identified name and keeps the user label as subtitle', () => {
    const item = identification({ nickname: 'Den lilla bagest' });
    expect(plantCardTitle(item)).toBe('Lavendel');
    expect(plantCardSubtitle(item)).toBe('Den lilla bagest');
  });

  it('falls back to the scientific name as subtitle when there is no nickname', () => {
    expect(plantCardSubtitle(identification())).toBe('Lavandula angustifolia');
  });

  it('uses the nickname as title when nothing was identified', () => {
    const item = identification({ suggestions: [], nickname: 'Ved stenen' });
    expect(plantCardTitle(item)).toBe('Ved stenen');
  });
});

describe('knownPlantsForAnalysis', () => {
  it('only passes on plants the user opted in to', () => {
    const plants = knownPlantsForAnalysis([
      identification({ id: 'a', nickname: 'Ved stenen' }),
      identification({ id: 'b', includeInAnalysis: false }),
    ]);
    expect(plants).toEqual([
      {
        label: 'Ved stenen',
        note: '',
        commonName: 'Lavendel',
        scientificName: 'Lavandula angustifolia',
        confidence: 0.89,
      },
    ]);
  });

  it('uses the suggestion the user picked, not always the top one', () => {
    const plants = knownPlantsForAnalysis([
      identification({
        suggestions: [suggestion(), suggestion({ scientificName: 'Salvia nemorosa', commonName: 'Salvie', score: 0.31 })],
        selectedSuggestionIndex: 1,
      }),
    ]);
    expect(plants[0]).toMatchObject({ commonName: 'Salvie', confidence: 0.31 });
  });

  it('skips identifications without any suggestion', () => {
    expect(knownPlantsForAnalysis([identification({ suggestions: [] })])).toEqual([]);
  });

  it('caps the number of plants sent to the model', () => {
    const many = Array.from({ length: 8 }, (_, index) => identification({ id: `id-${index}` }));
    expect(knownPlantsForAnalysis(many)).toHaveLength(5);
  });
});
