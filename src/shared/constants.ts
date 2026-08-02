export const FEATURE_TYPES = [
  'garden_boundary',
  'building',
  'lawn',
  'bed',
  'slope',
  'terrace',
  'path',
  'tree',
  'shrub',
  'hedge',
  'other_area',
  'other_point',
] as const;

export const FEATURE_TYPE_LABELS: Record<(typeof FEATURE_TYPES)[number], string> = {
  garden_boundary: 'Havegrænse',
  building: 'Bygning',
  lawn: 'Græs',
  bed: 'Bed',
  slope: 'Skrænt',
  terrace: 'Terrasse',
  path: 'Sti',
  tree: 'Træ',
  shrub: 'Busk',
  hedge: 'Hæk',
  other_area: 'Andet område',
  other_point: 'Andet punkt',
};

export const CONFIDENCE_LEVELS = ['certain', 'likely', 'unknown'] as const;

export const CONFIDENCE_LABELS: Record<(typeof CONFIDENCE_LEVELS)[number], string> = {
  certain: 'Sikker',
  likely: 'Sandsynlig',
  unknown: 'Ukendt',
};

export const DEFAULT_MAP_CENTER = { lat: 56.1629, lng: 10.2039 };
