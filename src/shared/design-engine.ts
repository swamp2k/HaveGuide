import { DESIGN_GOAL_LABELS, FEATURE_TYPE_LABELS } from './constants';
import type {
  DesignBudget,
  DesignConstraints,
  DesignGoal,
  DesignInspiration,
  DesignOption,
  DesignPlantRecommendation,
  DesignVisual,
  DesignWorkItem,
  FeatureType,
  GardenAssessment,
  PlantCatalogEntry,
} from './types';

export type GeneratedDesignOption = Omit<DesignOption, 'id' | 'projectId' | 'createdAt' | 'selectedAt' | 'status'>;

interface DesignEngineInput {
  goal: DesignGoal;
  constraints: DesignConstraints;
  targetFeatureType: FeatureType | null;
  assessments: Array<Pick<GardenAssessment, 'category' | 'value' | 'notes'>>;
  catalog: PlantCatalogEntry[];
  inspiration: Omit<DesignInspiration, 'id' | 'gardenId' | 'createdAt'> | null;
}

interface SiteSignals {
  sun: string[];
  moisture: string[];
  soil: string[];
  slope: boolean;
  notes: string[];
}

interface Strategy {
  key: 'robust' | 'wildlife' | 'structure';
  name: string;
  description: string;
}

const STRATEGIES: Strategy[] = [
  { key: 'robust', name: 'Rolig og robust', description: 'Få plantetyper, gentagelser og lavt løbende arbejde.' },
  { key: 'wildlife', name: 'Blomstring og liv', description: 'Lang blomstring og højere værdi for havens insekter.' },
  { key: 'structure', name: 'Struktur hele året', description: 'Tydelige former, højdeforskelle og mere vintersilhuet.' },
];

const PALETTE: Record<string, string> = {
  white: '#f6f3e8', yellow: '#e8c34a', orange: '#d9853b', pink: '#d98ca3', red: '#b9554c',
  purple: '#75609b', blue: '#5e82a8', green: '#4f7454', brown: '#806348',
};

function includesAny(value: string, terms: string[]): boolean {
  const normalized = value.toLocaleLowerCase('da');
  return terms.some((term) => normalized.includes(term));
}

function siteSignals(assessments: DesignEngineInput['assessments'], targetFeatureType: FeatureType | null): SiteSignals {
  const signals: SiteSignals = { sun: [], moisture: [], soil: [], slope: targetFeatureType === 'slope', notes: [] };
  for (const assessment of assessments) {
    const text = `${assessment.value} ${assessment.notes}`.trim();
    signals.notes.push(`${assessment.category}: ${assessment.value}`);
    if (assessment.category === 'sun') {
      if (includesAny(text, ['fuld sol', 'meget sol', 'sol fra', 'solrig'])) signals.sun.push('sun');
      if (includesAny(text, ['halvskygge', 'delvis skygge'])) signals.sun.push('part_shade');
      if (includesAny(text, ['skygge'])) signals.sun.push('shade');
    }
    if (assessment.category === 'moisture') {
      if (includesAny(text, ['tør', 'dræn'])) signals.moisture.push('dry');
      if (includesAny(text, ['fugt', 'våd'])) signals.moisture.push('moist');
      if (includesAny(text, ['normal', 'middel'])) signals.moisture.push('normal');
    }
    if (assessment.category === 'soil') {
      if (includesAny(text, ['sand'])) signals.soil.push('sandy');
      if (includesAny(text, ['ler'])) signals.soil.push('clay');
      if (includesAny(text, ['kalk'])) signals.soil.push('chalk');
      if (includesAny(text, ['muld', 'loam', 'almindelig'])) signals.soil.push('loam');
    }
    if (assessment.category === 'slope' && !includesAny(text, ['flad', 'ingen hældning'])) signals.slope = true;
  }
  return {
    ...signals,
    sun: [...new Set(signals.sun)],
    moisture: [...new Set(signals.moisture)],
    soil: [...new Set(signals.soil)],
  };
}

function isExcluded(entry: PlantCatalogEntry, constraints: DesignConstraints): boolean {
  if (constraints.maxHeightCm !== null && entry.heightCm > constraints.maxHeightCm) return true;
  if ((constraints.avoidPotentiallyHarmful || constraints.childrenUseGarden || constraints.petsUseGarden) && entry.safety === 'avoid') return true;
  if (constraints.effort === 'low' && entry.maintenanceLevel > 3) return true;
  return false;
}

function scoreEntry(
  entry: PlantCatalogEntry,
  goal: DesignGoal,
  strategy: Strategy['key'],
  constraints: DesignConstraints,
  signals: SiteSignals,
): number {
  let score = 10;
  if (signals.sun.length) score += entry.sun.some((value) => signals.sun.includes(value)) ? 4 : -4;
  if (signals.moisture.length) score += entry.moisture.some((value) => signals.moisture.includes(value)) ? 3 : -3;
  if (signals.soil.length) score += entry.soil.some((value) => signals.soil.includes(value)) ? 2 : -2;
  if (constraints.colors.length) score += entry.colors.some((value) => constraints.colors.includes(value)) ? 3 : -2;
  if (constraints.winterInterest && entry.evergreen) score += 4;
  if (entry.safety === 'low_risk') score += constraints.childrenUseGarden || constraints.petsUseGarden ? 3 : 1;
  if (entry.safety === 'review' && (constraints.childrenUseGarden || constraints.petsUseGarden)) score -= 1;

  if (goal === 'low_maintenance') score += 7 - entry.maintenanceLevel;
  if (goal === 'slope' || signals.slope) score += entry.slopeSuitable ? 7 : -2;
  if (goal === 'privacy') score += entry.privacySuitable ? 7 : -2;
  if (goal === 'flowers') score += Math.min(entry.floweringMonths.length, 5);
  if (goal === 'biodiversity') score += entry.biodiversityScore * 2;
  if (goal === 'seating') score += entry.maintenanceLevel <= 2 ? 3 : 0;
  if (goal === 'edible') score += entry.scientificName === 'Corylus avellana' ? 8 : -1;

  if (strategy === 'robust') score += (6 - entry.maintenanceLevel) * 2 + (entry.category === 'groundcover' ? 2 : 0);
  if (strategy === 'wildlife') score += entry.biodiversityScore * 2 + Math.min(entry.floweringMonths.length, 4);
  if (strategy === 'structure') score += (entry.evergreen ? 4 : 0) + (entry.privacySuitable ? 3 : 0) + Math.min(entry.heightCm / 80, 4);
  return score;
}

function quantityHint(entry: PlantCatalogEntry): string {
  if (entry.category === 'groundcover') return `ca. 5–8 pr. m² med omkring ${entry.spreadCm} cm bredde som pejlemærke`;
  if (entry.category === 'hedge') return 'mål længden og fastlæg planteafstand ud fra den konkrete sort';
  if (entry.category === 'shrub') return '1–3 grupperede buske afhængigt af områdets størrelse';
  if (entry.category === 'grass') return '3–7 planter i gentagne grupper';
  if (entry.category === 'annual') return 'så eller plant i mindre gentagne felter';
  return '3–7 planter i gentagne grupper';
}

function reason(entry: PlantCatalogEntry, goal: DesignGoal, signals: SiteSignals): string {
  const reasons: string[] = [];
  if (goal === 'low_maintenance' && entry.maintenanceLevel <= 2) reasons.push('lavt forventet vedligeholdelsesniveau');
  if ((goal === 'slope' || signals.slope) && entry.slopeSuitable) reasons.push('egnet som del af en plantedækket skrænt');
  if (goal === 'privacy' && entry.privacySuitable) reasons.push('kan bidrage med højde eller afskærmning');
  if (goal === 'biodiversity' || goal === 'flowers') reasons.push('blomstring og værdi for havens insekter');
  if (entry.evergreen) reasons.push('grøn struktur om vinteren');
  if (!reasons.length) reasons.push('passer rimeligt til de registrerede forhold og planens struktur');
  return reasons.join(', ');
}

function workItems(goal: DesignGoal, strategy: Strategy, signals: SiteSignals): DesignWorkItem[] {
  const items: DesignWorkItem[] = [
    { order: 1, title: 'Mål området op', description: 'Bekræft areal, adgangsvej og hvad der skal bevares, før der bestilles planter.', effort: 'small' },
    { order: 2, title: 'Forbered jorden', description: 'Fjern flerårigt ukrudt og forbedr kun jorden, hvor de valgte planter kræver det.', effort: 'medium' },
  ];
  if (signals.slope || goal === 'slope') {
    items.push({ order: 3, title: 'Stabilisér skrænten først', description: 'Arbejd i mindre felter, behold eksisterende rødder hvor muligt, og brug midlertidig erosionssikring på stejle partier.', effort: 'large' });
  }
  if (goal === 'seating') {
    items.push({ order: items.length + 1, title: 'Fastlæg opholdsfladen', description: 'Placér siddeplads og ganglinjer før beplantningen, så planterne ikke senere skal flyttes.', effort: 'large' });
  }
  items.push(
    { order: items.length + 1, title: `Plant efter strategien “${strategy.name}”`, description: 'Gentag få plantegrupper frem for at placere hver plante som et enkeltstående element.', effort: 'medium' },
    { order: items.length + 2, title: 'Dæk jorden og vand ind', description: 'Brug et passende dæklag og hold øje med udtørring i etableringsperioden.', effort: 'small' },
  );
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function budgetBand(constraints: DesignConstraints, selected: PlantCatalogEntry[], goal: DesignGoal): 'low' | 'medium' | 'high' {
  if (constraints.budget !== 'flexible') return constraints.budget;
  if (goal === 'seating' || selected.some((entry) => entry.category === 'hedge' || entry.heightCm > 200)) return 'high';
  if (selected.some((entry) => entry.category === 'shrub' || entry.category === 'grass')) return 'medium';
  return 'low';
}

function visualFor(selected: PlantCatalogEntry[], constraints: DesignConstraints, inspiration: DesignEngineInput['inspiration']): DesignVisual {
  const requestedColors = constraints.colors.length ? constraints.colors : selected.flatMap((entry) => entry.colors).slice(0, 4);
  const palette = [...new Set(requestedColors)].slice(0, 5).map((color) => PALETTE[color] ?? PALETTE.green);
  const positions = [
    { x: 18, y: 72 }, { x: 38, y: 58 }, { x: 58, y: 74 }, { x: 76, y: 48 }, { x: 86, y: 70 },
  ];
  const layers = selected.slice(0, positions.length).map((entry, index) => {
    const position = positions[index] ?? { x: 50, y: 60 };
    const kind: DesignVisual['layers'][number]['kind'] = entry.privacySuitable
      ? 'screen'
      : entry.category === 'groundcover'
        ? 'groundcover'
        : entry.category === 'shrub' || entry.category === 'grass'
          ? 'structure'
          : 'flower';
    return { label: entry.commonName, kind, x: position.x, y: position.y };
  });
  return {
    backgroundMediaId: inspiration?.mediaId ?? null,
    palette: palette.length ? palette : [PALETTE.green, '#dcebd8', '#f6f3e8'],
    layers,
    disclaimer: 'Konceptvisning – placering, antal og plantesort skal bekræftes på stedet før køb.',
  };
}

function ruleTrace(input: DesignEngineInput, signals: SiteSignals, selected: PlantCatalogEntry[]): string[] {
  const trace = [
    `Mål: ${DESIGN_GOAL_LABELS[input.goal]}.`,
    input.targetFeatureType ? `Målområdet er registreret som ${FEATURE_TYPE_LABELS[input.targetFeatureType].toLocaleLowerCase('da')}.` : 'Planen gælder haven som helhed.',
    input.constraints.effort === 'low' ? 'Planter med højt vedligeholdelsesniveau er fravalgt.' : 'Vedligeholdelsesniveauet må variere.',
  ];
  if (input.constraints.maxHeightCm !== null) trace.push(`Planter over ${input.constraints.maxHeightCm} cm er fravalgt.`);
  if (input.constraints.avoidPotentiallyHarmful || input.constraints.childrenUseGarden || input.constraints.petsUseGarden) {
    trace.push('Planter markeret “undgå” i startkataloget er fravalgt; “kontrollér” er stadig ikke en sikkerhedsgaranti.');
  }
  if (signals.sun.length || signals.moisture.length || signals.soil.length) trace.push('Registrerede sol-, fugt- og jordforhold indgår i rangeringen.');
  else trace.push('Der mangler præcise vækstforhold; anbefalingerne er derfor mere forsigtige.');
  if (input.inspiration) trace.push(`Inspirationen “${input.inspiration.title}” påvirker stil og ønskede elementer, ikke vækstkrav.`);
  if (input.goal === 'edible') trace.push('Spiselighed er ikke automatisk godkendt; korrekt plante, sort og anvendelse skal verificeres før indtagelse.');
  if (selected.some((entry) => entry.safety === 'review')) trace.push('Mindst én anbefaling kræver særskilt sikkerhedskontrol for børn eller dyr.');
  return trace;
}

function titleFor(goal: DesignGoal, strategy: Strategy): string {
  const prefixes: Record<DesignGoal, string> = {
    low_maintenance: 'Den nemme have', slope: 'Den plantede skrænt', privacy: 'Det grønne rum', flowers: 'Blomsterforløbet',
    biodiversity: 'Den levende have', seating: 'Ophold mellem planter', edible: 'Den nyttige have', other: 'Den tilpassede have',
  };
  return `${prefixes[goal]} – ${strategy.name.toLocaleLowerCase('da')}`;
}

export function generateDesignOptions(input: DesignEngineInput): GeneratedDesignOption[] {
  const signals = siteSignals(input.assessments, input.targetFeatureType);
  const eligible = input.catalog.filter((entry) => !isExcluded(entry, input.constraints));
  const source = eligible.length ? eligible : input.catalog.filter((entry) => entry.safety !== 'avoid');

  return STRATEGIES.map((strategy, strategyIndex) => {
    const ranked = source
      .map((entry) => ({ entry, score: scoreEntry(entry, input.goal, strategy.key, input.constraints, signals) }))
      .sort((a, b) => b.score - a.score || a.entry.commonName.localeCompare(b.entry.commonName, 'da'));
    const selected = ranked.slice(strategyIndex, strategyIndex + 5).map((item) => item.entry);
    if (selected.length < 4) {
      for (const item of ranked) {
        if (!selected.some((entry) => entry.id === item.entry.id)) selected.push(item.entry);
        if (selected.length >= 5) break;
      }
    }
    const plants: DesignPlantRecommendation[] = selected.map((entry) => ({
      catalogId: entry.id,
      commonName: entry.commonName,
      scientificName: entry.scientificName,
      quantityHint: quantityHint(entry),
      reason: reason(entry, input.goal, signals),
      safety: entry.safety,
      safetyNote: entry.safetyNote,
      sourceLabel: entry.sourceLabel,
      sourceUrl: entry.sourceUrl,
    }));
    const maintenance = selected.length
      ? Math.max(1, Math.min(5, Math.round(selected.reduce((sum, entry) => sum + entry.maintenanceLevel, 0) / selected.length)))
      : 3;
    const biodiversity = selected.length
      ? Math.max(1, Math.min(5, Math.round(selected.reduce((sum, entry) => sum + entry.biodiversityScore, 0) / selected.length)))
      : 1;
    return {
      position: strategyIndex + 1,
      name: titleFor(input.goal, strategy),
      strategy: strategy.description,
      summary: `${DESIGN_GOAL_LABELS[input.goal]} løses med ${selected.length} hovedplanter og en trinvis arbejdsrækkefølge.`,
      maintenanceScore: maintenance,
      budgetBand: budgetBand(input.constraints, selected, input.goal),
      biodiversityScore: biodiversity,
      plants,
      workItems: workItems(input.goal, strategy, signals),
      ruleTrace: ruleTrace(input, signals, selected),
      visual: visualFor(selected, input.constraints, input.inspiration),
    };
  });
}

export function replaceVisualBackground(visual: DesignVisual, backgroundMediaId: string | null): DesignVisual {
  return { ...visual, backgroundMediaId };
}
