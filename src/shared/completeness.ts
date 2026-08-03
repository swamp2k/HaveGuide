import type { GardenCompleteness } from './types';

export interface CompletenessInput {
  featureCount: number;
  hasBoundary: boolean;
  mediaCount: number;
  plantCount: number;
  assessmentCategoryCount: number;
  observationCount: number;
  walkCompleted: boolean;
}

export function calculateCompleteness(input: CompletenessInput): GardenCompleteness {
  const checks = [
    { ok: input.hasBoundary && input.featureCount >= 3, label: 'Et grundlæggende havekort' },
    { ok: input.mediaCount >= 3, label: 'Mindst tre billeder fra haven' },
    { ok: input.plantCount >= 1, label: 'Mindst én registreret plante' },
    { ok: input.assessmentCategoryCount >= 3, label: 'Sol, jord og andre haveforhold' },
    { ok: input.observationCount >= 1, label: 'Mindst én observation eller problemzone' },
    { ok: input.walkCompleted, label: 'Den guidede havevandring' },
  ];
  const completed = checks.filter((check) => check.ok).map((check) => check.label);
  const missing = checks.filter((check) => !check.ok).map((check) => check.label);
  return {
    percent: Math.round((completed.length / checks.length) * 100),
    completed,
    missing,
    counts: {
      features: input.featureCount,
      media: input.mediaCount,
      plants: input.plantCount,
      assessments: input.assessmentCategoryCount,
      observations: input.observationCount,
    },
  };
}
