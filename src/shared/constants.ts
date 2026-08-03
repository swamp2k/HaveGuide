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

export const DESIGN_GOALS = ['low_maintenance', 'slope', 'privacy', 'flowers', 'biodiversity', 'seating', 'edible', 'other'] as const;
export const DESIGN_GOAL_LABELS: Record<(typeof DESIGN_GOALS)[number], string> = {
  low_maintenance: 'Mindre vedligeholdelse',
  slope: 'En bedre skrænt',
  privacy: 'Mere læ og privatliv',
  flowers: 'Flere blomster',
  biodiversity: 'Mere liv i haven',
  seating: 'Et bedre opholdssted',
  edible: 'Flere spiselige planter',
  other: 'Et andet mål',
};

export const DESIGN_EFFORT_LEVELS = ['low', 'medium', 'flexible'] as const;
export const DESIGN_EFFORT_LABELS: Record<(typeof DESIGN_EFFORT_LEVELS)[number], string> = {
  low: 'Så lidt arbejde som muligt',
  medium: 'Et almindeligt niveau',
  flexible: 'Arbejdet må gerne variere',
};

export const DESIGN_BUDGET_LEVELS = ['low', 'medium', 'high', 'flexible'] as const;
export const DESIGN_BUDGET_LABELS: Record<(typeof DESIGN_BUDGET_LEVELS)[number], string> = {
  low: 'Lavt budget',
  medium: 'Mellem budget',
  high: 'Plads til større ændringer',
  flexible: 'Ikke besluttet endnu',
};

export const DESIGN_COLORS = ['white', 'yellow', 'orange', 'pink', 'red', 'purple', 'blue', 'green', 'brown'] as const;
export const DESIGN_COLOR_LABELS: Record<(typeof DESIGN_COLORS)[number], string> = {
  white: 'Hvid',
  yellow: 'Gul',
  orange: 'Orange',
  pink: 'Rosa',
  red: 'Rød',
  purple: 'Lilla',
  blue: 'Blå',
  green: 'Grøn',
  brown: 'Brun',
};

export const DEFAULT_MAP_CENTER = { lat: 56.1629, lng: 10.2039 };
