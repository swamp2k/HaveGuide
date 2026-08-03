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

export const OBSERVATION_KINDS = ['plant_note', 'condition', 'problem', 'photo_note'] as const;
export const OBSERVATION_KIND_LABELS: Record<(typeof OBSERVATION_KINDS)[number], string> = {
  plant_note: 'Plantenote',
  condition: 'Forhold i haven',
  problem: 'Problem',
  photo_note: 'Billednote',
};

export const ASSESSMENT_CATEGORIES = ['sun', 'moisture', 'soil', 'slope', 'wind', 'maintenance'] as const;
export const ASSESSMENT_CATEGORY_LABELS: Record<(typeof ASSESSMENT_CATEGORIES)[number], string> = {
  sun: 'Sol og skygge',
  moisture: 'Fugt',
  soil: 'Jord',
  slope: 'Hældning',
  wind: 'Vind',
  maintenance: 'Vedligeholdelse',
};

export const PLANT_ORGANS = ['auto', 'leaf', 'flower', 'fruit', 'bark', 'habit', 'other'] as const;
export const PLANT_ORGAN_LABELS: Record<(typeof PLANT_ORGANS)[number], string> = {
  auto: 'Automatisk',
  leaf: 'Blad',
  flower: 'Blomst',
  fruit: 'Frugt',
  bark: 'Bark',
  habit: 'Hele planten',
  other: 'Andet',
};

export const WALK_STEPS = [
  { title: 'Start ved huset', description: 'Få overblik over havens form og de faste bygninger.' },
  { title: 'Gå langs kanten', description: 'Registrér hegn, hække, naboer, vind og indkig.' },
  { title: 'Se på jorden', description: 'Notér sol, skygge, fugt, jord og tydelige hældninger.' },
  { title: 'Find planterne', description: 'Tag oversigts- og nærbilleder af træer, buske og bede.' },
  { title: 'Markér problemer', description: 'Registrér besværlige områder, ukrudt og vedligeholdelsesbyrder.' },
  { title: 'Afslut med et overblik', description: 'Se hvad der mangler, og bekræft de vigtigste observationer.' },
] as const;

export const DEFAULT_MAP_CENTER = { lat: 56.1629, lng: 10.2039 };
