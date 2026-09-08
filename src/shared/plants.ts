import type { PlantIdentification, PlantSuggestion } from './types';

export const MAX_PLANTS_IN_ANALYSIS = 5;

export function selectedSuggestion(identification: PlantIdentification): PlantSuggestion | null {
  const index = Math.max(0, Math.min(identification.selectedSuggestionIndex, identification.suggestions.length - 1));
  return identification.suggestions[index] ?? null;
}

/** Title shown on a plant card: the identified name, with the user's own label as subtitle. */
export function plantCardTitle(identification: PlantIdentification): string {
  const suggestion = selectedSuggestion(identification);
  if (suggestion) return suggestion.commonName || suggestion.scientificName;
  return identification.nickname || 'Ukendt plante';
}

export function plantCardSubtitle(identification: PlantIdentification): string {
  const suggestion = selectedSuggestion(identification);
  if (identification.nickname) return identification.nickname;
  if (suggestion && suggestion.commonName) return suggestion.scientificName;
  return '';
}

export interface KnownPlant {
  label: string;
  note: string;
  commonName: string;
  scientificName: string;
  confidence: number;
}

/** The plants the user has opted in to, newest first, capped for the AI prompt. */
export function knownPlantsForAnalysis(
  identifications: PlantIdentification[],
  limit = MAX_PLANTS_IN_ANALYSIS,
): KnownPlant[] {
  return identifications
    .filter((item) => item.includeInAnalysis)
    .flatMap((item) => {
      const suggestion = selectedSuggestion(item);
      if (!suggestion) return [];
      return [{
        label: item.nickname,
        note: item.note,
        commonName: suggestion.commonName,
        scientificName: suggestion.scientificName,
        confidence: suggestion.score,
      }];
    })
    .slice(0, limit);
}
