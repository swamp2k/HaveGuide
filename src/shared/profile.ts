import type { AreaProfile } from './types';

export const EMPTY_PROFILE: AreaProfile = {
  sun: null,
  moisture: null,
  soil: null,
  drainage: null,
  wind: null,
  notes: '',
  goals: [],
};

/** The one place the growing-condition choices and their Danish labels live. */
export const PROFILE_OPTIONS = {
  sun: [
    ['full_sun', 'Fuld sol'],
    ['part_sun', 'Halvsol'],
    ['shade', 'Skygge'],
  ],
  moisture: [
    ['dry', 'Tørt'],
    ['normal', 'Normalt'],
    ['moist', 'Fugtigt'],
    ['wet', 'Vådt'],
  ],
  soil: [
    ['sand', 'Sandet'],
    ['loam', 'Muldjord'],
    ['clay', 'Leret'],
    ['mixed', 'Blandet'],
    ['unknown', 'Ved ikke'],
  ],
  drainage: [
    ['fast', 'Dræner hurtigt'],
    ['normal', 'Normalt dræn'],
    ['slow', 'Holder på vand'],
    ['unknown', 'Ved ikke'],
  ],
  wind: [
    ['sheltered', 'Læ'],
    ['normal', 'Normalt'],
    ['exposed', 'Vindudsat'],
    ['unknown', 'Ved ikke'],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [string, string]>>;

export type ProfileConditionKey = keyof typeof PROFILE_OPTIONS;

export const PROFILE_FIELD_LABEL: Record<ProfileConditionKey, string> = {
  sun: 'Sol',
  moisture: 'Fugt',
  soil: 'Jord',
  drainage: 'Dræn',
  wind: 'Vind',
};

const NOT_PROVIDED = 'Ikke oplyst';

export function isProfileComplete(profile: AreaProfile): boolean {
  return Boolean(profile.sun && profile.moisture && profile.soil && profile.drainage);
}

/**
 * A condition counts as known only when the user picked a real value. `null` means the field was
 * never filled in, and `'unknown'` means the user explicitly answered "Ved ikke" — neither is an
 * answer we can plan on.
 */
export function isKnownCondition(value: string | null | undefined): boolean {
  return Boolean(value) && value !== 'unknown';
}

export function profileOptionLabel(key: ProfileConditionKey, value: string | null): string {
  if (!value) return NOT_PROVIDED;
  const options: ReadonlyArray<readonly [string, string]> = PROFILE_OPTIONS[key];
  return options.find(([option]) => option === value)?.[1] ?? value;
}

/**
 * Human-readable Danish rendering of the profile for the AI prompt. Raw enum values like
 * `full_sun` read as machine data the model feels free to re-derive from the photo; Danish labels
 * under an explicit heading read as facts the user already gave us.
 */
export function describeProfile(profile: AreaProfile): string {
  const notes = profile.notes.trim();
  const goals = profile.goals.filter((goal) => goal.trim().length > 0);

  const lines = [
    ...(Object.keys(PROFILE_OPTIONS) as ProfileConditionKey[]).map(
      (key) => `- ${PROFILE_FIELD_LABEL[key]}: ${profileOptionLabel(key, profile[key])}`,
    ),
    `- Ønsker: ${goals.length > 0 ? goals.join(', ') : NOT_PROVIDED}`,
    `- Noter: ${notes || NOT_PROVIDED}`,
  ];

  return [
    'BRUGERENS OPLYSTE FORHOLD',
    'Disse oplysninger kommer direkte fra brugeren og skal behandles som kendte forhold:',
    '',
    ...lines,
  ].join('\n');
}
