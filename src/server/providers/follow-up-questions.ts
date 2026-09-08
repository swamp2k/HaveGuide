import type { AreaProfile } from '../../shared/types';
import { isKnownCondition } from '../../shared/profile';

/**
 * The model is told not to ask for conditions the user already filled in, but prompt compliance is
 * not a guarantee. This module removes the redundant questions afterwards.
 *
 * The patterns deliberately target *direct* profile questions ("Hvor meget sol får bedet?") rather
 * than every sentence containing a category word. A question that happens to mention sun while
 * asking about something else ("Er der sæsoner hvor træets krone giver mere skygge?") is far more
 * useful to keep than a redundant question is harmful to leave in, so every pattern here is
 * anchored on question phrasing plus a subject, and anything phrased as a question about change
 * over time is kept outright.
 */

type Category = 'sun' | 'moisture' | 'soil' | 'drainage' | 'wind' | 'goals';

/** Danish letters, so word boundaries survive æ/ø/å (JS `\b` does not). */
const LETTER = 'a-zæøåäöüé';

/** Wraps alternatives so they only match whole words. */
function w(alternatives: string): string {
  return `(?<![${LETTER}])(?:${alternatives})(?![${LETTER}])`;
}

/** Same-question filler between two anchors, capped so anchors stay related. */
function gap(max = 40): string {
  return `[^?]{0,${max}}`;
}

const AREA = 'bedet|bedene|området|arealet|stedet|haven|plantebedet|hjørnet';

/**
 * Questions about how a condition varies over the season or changes over time are not answered by
 * a single profile value, so they are kept regardless of what the profile holds.
 */
const CONTEXTUAL_PATTERNS: RegExp[] = [
  new RegExp(w('sæson|sæsoner|sæsonen|årstid|årstider|årstiden')),
  new RegExp(w('vinter|vinteren|vintre|sommer|sommeren|forår|foråret|efterår|efteråret')),
  new RegExp(w('ændrer|ændres|ændret|ændre|varierer|variere|varieret|skifter|skifte')),
  new RegExp(w('krone|kronen|kroner')),
  /over tid|på sigt|om året|hen over året|i løbet af året|fremover|når (træet|planten|busken)/,
];

const CATEGORY_PATTERNS: Record<Category, RegExp[]> = {
  sun: [
    // "Hvor meget sol får bedet i løbet af dagen?", "Hvor mange timers sol …"
    new RegExp(`${w('hvor')} (meget|mange|lang|længe|få|mørkt|lyst)${gap(60)}${w('sol|solen|sollys|sollyset|soltimer|solskin|lys|lyset|skygge|skyggen|halvskygge')}`),
    // "Hvordan er lysforholdene?" — only as the opening of the question, so a clause that merely
    // refers to the light conditions survives.
    new RegExp(`^(hvordan|hvad|hvilke|hvilken)${gap(60)}${w('lysforhold|lysforholdene|solforhold|solforholdene|skyggeforhold|skyggeforholdene')}`),
    // "Er området i fuld sol?", "Står bedet i skygge om eftermiddagen?"
    new RegExp(`${w('er|ligger|får|står|har|vender')}${gap(30)}${w(AREA)}${gap(30)}${w('sol|solen|sollys|skygge|skyggen|halvskygge|halvsol')}`),
    new RegExp(`${w('får|har')}${gap(30)}${w('direkte|fuld')} sol`),
  ],
  moisture: [
    // "Er jorden fugtig?", "Bliver bedet vandlidende?"
    new RegExp(`${w('er|bliver|holder|føles|virker|står')}${gap(30)}${w(`jorden|jordbunden|${AREA}`)}${gap(30)}${w('fugtig|fugtigt|fugtige|våd|vådt|våde|tør|tørt|tørre|vandlidende|sumpet|vandmættet|udtørret')}`),
    new RegExp(`${w('hvor')} (fugtig|fugtigt|våd|vådt|tør|tørt)`),
    new RegExp(`${w('hvor')} (meget|hurtigt|ofte|tit)${gap(60)}${w('tørrer|udtørrer|vander|vandes|fugt|fugten|fugtig|fugtigt|vand|vandet')}`),
    new RegExp(`^(hvordan|hvad|hvilke|hvilken)${gap(60)}${w('fugt|fugten|fugtighed|fugtigheden|fugtforhold|fugtforholdene|vandforhold|vandforholdene')}`),
    new RegExp(`${w('holder')}${gap(30)}${w(`jorden|${AREA}`)}${gap(20)}${w('på')}${gap(10)}${w('vand|vandet|fugt|fugten')}`),
  ],
  soil: [
    // "Kender du jordtypen?" — the word itself only appears in questions about the soil type.
    new RegExp(w('jordtype|jordtypen|jordtyper|jordbundstype|jordbundstypen|jordbundsforhold|jordbundsforholdene')),
    new RegExp(`^(hvilken|hvilke)${gap(30)}${w('jord|jorden|muld|muldjord|jordbund|jordbunden')}`),
    new RegExp(`^(kender|ved) du${gap(40)}${w('jord|jorden|jordbund|jordbunden')}`),
    // "Hvad er jorden for en type?" / "Hvad slags jord er der?"
    new RegExp(`${w('hvad|hvilken|hvilke')}${gap(30)}(${w('slags|type|typen')}${gap(20)}${w('jord|jorden')}|${w('jord|jorden')}${gap(20)}${w('slags|type|typen')})`),
    // "Er jorden sandet eller leret?"
    new RegExp(`${w('er|har|indeholder')}${gap(30)}${w(`jorden|jordbunden|${AREA}`)}${gap(30)}${w('sandet|sandjord|leret|lerjord|lerholdig|muld|muldjord|muldet|blandet')}`),
  ],
  drainage: [
    new RegExp(`^(hvordan|hvor|er|bliver|kender|ved|står|har)${gap(60)}${w('dræn|dræner|dræning|dræningen|drænet|drænes|drænforhold|drænforholdene|drænevne|drænevnen')}`),
    new RegExp(`${w('dræner')}${gap(30)}${w(`jorden|jordbunden|vandet|${AREA}`)}`),
    new RegExp(`stående vand|${w('vand|vandet')}${gap(15)}${w('står|bliver stående|samler sig')}|${w('samler')}${gap(20)}${w('vand|vandet')}|${w('vandpytter|pytter|søer')}`),
  ],
  wind: [
    new RegExp(w('vindudsat|vindudsatte|vindforhold|vindforholdene|blæsehjørne|blæsehjørnet')),
    new RegExp(`^(er|ligger|står|hvordan|hvor|har)${gap(60)}${w('vind|vinden|blæst|blæsten|læ|lægivende|forblæst')}`),
    new RegExp(`${w('i')} ${w('læ')}`),
  ],
  goals: [
    // "Hvad er formålet med bedet?"
    new RegExp(`^(hvad|hvilket|hvilke|hvilken)${gap(40)}${w('formål|formålet|formålene|mål|målet|hensigt|hensigten|ambition|ambitionen')}`),
    // "Hvad vil du gerne have ud af området?"
    new RegExp(`^(hvad|hvilke|hvilken|hvordan)${gap(40)}(vil|ønsker|kunne|drømmer|håber|forestiller|savner) du`),
    // "Hvad skal bedet bruges til?"
    new RegExp(`^(hvad|hvilke)${gap(40)}${w('skal|skulle|kan')}${gap(40)}${w(AREA)}${gap(30)}${w('bruges|anvendes|bruge|blive')}`),
    new RegExp(`${w('ønsker|ønskerne|mål|målet|målene|formål|formålet')}${gap(20)}${w('for|med')}${gap(20)}${w(AREA)}`),
  ],
};

/**
 * `goals` is intentionally not matched on plant-form words ("stauder", "buske", "bunddække"):
 * a goal like "Lav vedligeholdelse" does not answer "Vil du helst have stauder eller buske?", so
 * filtering those would drop a question the user still needs to answer.
 */

function knownCategories(profile: AreaProfile): Category[] {
  const known: Category[] = [];
  if (isKnownCondition(profile.sun)) known.push('sun');
  if (isKnownCondition(profile.moisture)) known.push('moisture');
  if (isKnownCondition(profile.soil)) known.push('soil');
  if (isKnownCondition(profile.drainage)) known.push('drainage');
  if (isKnownCondition(profile.wind)) known.push('wind');
  if (profile.goals.some((goal) => goal.trim().length > 0)) known.push('goals');
  return known;
}

function normalize(question: string): string {
  return question.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Drops follow-up questions that ask for growing conditions the user has already filled in.
 * Returns the questions unchanged when nothing in the profile is known, and an empty array when
 * every question was redundant — no replacement questions are invented.
 */
export function filterRedundantFollowUpQuestions(questions: string[], profile: AreaProfile): string[] {
  const known = knownCategories(profile);
  if (known.length === 0) return [...questions];

  return questions.filter((question) => {
    const text = normalize(question);
    if (CONTEXTUAL_PATTERNS.some((pattern) => pattern.test(text))) return true;
    return !known.some((category) => CATEGORY_PATTERNS[category].some((pattern) => pattern.test(text)));
  });
}
