import type { AreaProfile, PlantIdentification } from '../../../shared/types';
import { knownPlantsForAnalysis } from '../../../shared/plants';

const SUN: Record<string, string> = {
  full_sun: 'fuld sol',
  part_sun: 'halvskygge',
  shade: 'skygge',
};
const MOISTURE: Record<string, string> = {
  dry: 'tør jord',
  normal: 'normal fugtighed',
  moist: 'fugtig jord',
  wet: 'våd jord',
};
const SOIL: Record<string, string> = {
  sand: 'sandet jord',
  loam: 'muldjord',
  clay: 'leret jord',
  mixed: 'blandet jord',
  unknown: 'ukendt jordtype',
};
const DRAINAGE: Record<string, string> = {
  fast: 'hurtigt dræn',
  normal: 'normalt dræn',
  slow: 'dårligt dræn',
  unknown: 'ukendt dræn',
};
const WIND: Record<string, string> = {
  sheltered: 'i læ',
  normal: 'normal vind',
  exposed: 'vindudsat',
  unknown: 'ukendt vindforhold',
};

function conditionLines(profile: AreaProfile): string[] {
  const lines: string[] = [];
  if (profile.sun) lines.push(`Lys: ${SUN[profile.sun] ?? profile.sun}`);
  if (profile.moisture) lines.push(`Fugt: ${MOISTURE[profile.moisture] ?? profile.moisture}`);
  if (profile.soil) lines.push(`Jord: ${SOIL[profile.soil] ?? profile.soil}`);
  if (profile.drainage) lines.push(`Dræn: ${DRAINAGE[profile.drainage] ?? profile.drainage}`);
  if (profile.wind) lines.push(`Vind: ${WIND[profile.wind] ?? profile.wind}`);
  if (profile.goals.length > 0) lines.push(`Ønsker: ${profile.goals.join(', ')}`);
  if (profile.notes.trim()) lines.push(`Noter: ${profile.notes.trim()}`);
  return lines;
}

function plantLines(identifications: PlantIdentification[]): string[] {
  return knownPlantsForAnalysis(identifications).map((plant) => {
    const name = plant.commonName || plant.scientificName;
    const scientific = plant.commonName && plant.scientificName ? ` (${plant.scientificName})` : '';
    const where = plant.note ? `, står ${plant.note}` : '';
    const label = plant.label ? `"${plant.label}": ` : '';
    const certainty = plant.confidence < 0.5 ? ' — usikker bestemmelse' : '';
    return `- ${label}${name}${scientific}${where}${certainty}`;
  });
}

/**
 * Builds the edit instruction sent alongside the photo.
 *
 * The whole point is that the result must read as *this* garden after a change, not as a stock
 * garden render, so the constraints on structure, angle and light come before the user's wish
 * and are stated as hard requirements.
 */
export function buildVisualizationPrompt(input: {
  instruction: string;
  profile: AreaProfile;
  identifications: PlantIdentification[];
}): string {
  const conditions = conditionLines(input.profile);
  const plants = plantLines(input.identifications);

  const sections = [
    'Rediger dette foto af en rigtig privat have, så det viser, hvordan stedet kunne se ud efter en ændring.',
    '',
    'Absolutte krav:',
    '- Behold det eksisterende foto som grundlag. Dette er en redigering, ikke et nyt billede.',
    '- Behold nøjagtig samme kameravinkel, perspektiv, brændvidde og beskæring.',
    '- Behold alle faste elementer uændret: hus, bygninger, terrasse, hegn, mure, kanter, fliser, stier, trapper, større sten og eksisterende træer.',
    '- Behold årstid, vejr, lysretning, skygger og hvidbalance fra originalen.',
    '- Bevar fotografisk realisme. Ingen illustration, maleri, 3D-render eller overdreven farvemætning.',
    '- Byg ikke nye bygninger, terrasser, hegn, pools, møbler eller anlæg, medmindre brugeren udtrykkeligt beder om det.',
    '- Ændr kun bede, beplantning og de plantede flader, som ændringen handler om.',
    '- Tilføj ikke mennesker, dyr, tekst, logoer eller vandmærker.',
    '- Resultatet skal kunne genkendes som præcis denne have.',
    '',
    `Brugerens ønske: ${input.instruction.trim()}`,
  ];

  if (conditions.length > 0) {
    sections.push(
      '',
      'Voksevilkår på stedet (brug dem til at vælge realistisk beplantning):',
      ...conditions.map((line) => `- ${line}`),
    );
  }

  if (plants.length > 0) {
    sections.push(
      '',
      'Planter brugeren allerede har markeret her. Behold dem, hvor det giver mening:',
      ...plants,
    );
  }

  sections.push(
    '',
    'Vælg planter, der faktisk kan trives under de nævnte forhold i et nordeuropæisk klima.',
    'Hold ændringen realistisk i skala i forhold til haven på fotoet.',
  );

  return sections.join('\n');
}
