import type {
  ASSESSMENT_CATEGORIES,
  CONFIDENCE_LEVELS,
  DESIGN_BUDGET_LEVELS,
  DESIGN_COLORS,
  DESIGN_EFFORT_LEVELS,
  DESIGN_GOALS,
  FEATURE_TYPES,
  OBSERVATION_KINDS,
  PLANT_ORGANS,
} from './constants';
import type { GardenGeometry } from './geojson';

export type FeatureType = (typeof FEATURE_TYPES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];
export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number];
export type PlantOrgan = (typeof PLANT_ORGANS)[number];
export type PlantIdentificationStatus = 'unidentified' | 'suggested' | 'confirmed' | 'manual';
export type DesignGoal = (typeof DESIGN_GOALS)[number];
export type DesignEffort = (typeof DESIGN_EFFORT_LEVELS)[number];
export type DesignBudget = (typeof DESIGN_BUDGET_LEVELS)[number];
export type DesignColor = (typeof DESIGN_COLORS)[number];

export interface UserSummary { id: string; username: string; }
export interface BootstrapResponse { setupRequired: boolean; authenticated: boolean; user: UserSummary | null; }

export interface Garden {
  id: string;
  name: string;
  address: string;
  notes: string;
  centerLat: number;
  centerLng: number;
  createdAt: string;
  updatedAt: string;
}

export interface GardenFeature {
  id: string;
  gardenId: string;
  type: FeatureType;
  name: string;
  description: string;
  confidence: Confidence;
  geometry: GardenGeometry;
  createdAt: string;
  updatedAt: string;
}

export interface GardenDetail extends Garden { features: GardenFeature[]; }

export interface MediaItem {
  id: string;
  gardenId: string;
  featureId: string | null;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  note: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  contentUrl: string;
}

export interface GardenWalk {
  id: string;
  gardenId: string;
  status: 'active' | 'completed' | 'cancelled';
  currentStep: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface GardenObservation {
  id: string;
  gardenId: string;
  featureId: string | null;
  kind: ObservationKind;
  title: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  bearingDegrees: number | null;
  environment: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface PlantMediaLink {
  mediaId: string;
  contentUrl: string;
  organ: PlantOrgan;
  originalFilename: string;
}

export interface IdentificationSuggestion {
  id: string;
  scientificName: string;
  commonName: string;
  score: number;
  rank: number;
  gbifId: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
}

export interface GardenPlant {
  id: string;
  gardenId: string;
  featureId: string | null;
  commonName: string;
  scientificName: string;
  identificationStatus: PlantIdentificationStatus;
  confidence: Confidence;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  media: PlantMediaLink[];
  suggestions: IdentificationSuggestion[];
  createdAt: string;
  updatedAt: string;
}

export interface GardenAssessment {
  id: string;
  gardenId: string;
  category: AssessmentCategory;
  value: string;
  notes: string;
  geometry: GardenGeometry | null;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicatePlantCandidate { plantId: string; possibleDuplicateId: string; reason: string; }

export interface GardenCompleteness {
  percent: number;
  completed: string[];
  missing: string[];
  counts: { features: number; media: number; plants: number; assessments: number; observations: number; };
}

export interface GardenUnderstanding {
  walk: GardenWalk | null;
  observations: GardenObservation[];
  plants: GardenPlant[];
  assessments: GardenAssessment[];
  duplicateCandidates: DuplicatePlantCandidate[];
  completeness: GardenCompleteness;
  plantIdentificationAvailable: boolean;
  dataSources: Array<{ id: string; label: string; available: boolean; description: string }>;
}

export interface DesignConstraints {
  effort: DesignEffort;
  budget: DesignBudget;
  childrenUseGarden: boolean;
  petsUseGarden: boolean;
  avoidPotentiallyHarmful: boolean;
  colors: DesignColor[];
  maxHeightCm: number | null;
  winterInterest: boolean;
  notes: string;
}

export interface DesignInspiration {
  id: string;
  gardenId: string;
  mediaId: string | null;
  sourceUrl: string;
  title: string;
  notes: string;
  styleTags: string[];
  desiredElements: string[];
  avoidedElements: string[];
  createdAt: string;
}

export interface PlantCatalogEntry {
  id: string;
  commonName: string;
  scientificName: string;
  category: 'groundcover' | 'perennial' | 'grass' | 'shrub' | 'hedge' | 'annual';
  sun: string[];
  moisture: string[];
  soil: string[];
  maintenanceLevel: number;
  heightCm: number;
  spreadCm: number;
  evergreen: boolean;
  colors: DesignColor[];
  floweringMonths: number[];
  biodiversityScore: number;
  slopeSuitable: boolean;
  privacySuitable: boolean;
  safety: 'low_risk' | 'review' | 'avoid';
  safetyNote: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface DesignPlantRecommendation {
  catalogId: string;
  commonName: string;
  scientificName: string;
  quantityHint: string;
  reason: string;
  safety: PlantCatalogEntry['safety'];
  safetyNote: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface DesignWorkItem {
  order: number;
  title: string;
  description: string;
  effort: 'small' | 'medium' | 'large';
}

export interface DesignVisual {
  backgroundMediaId: string | null;
  palette: string[];
  layers: Array<{ label: string; kind: 'groundcover' | 'structure' | 'flower' | 'screen' | 'path'; x: number; y: number }>;
  disclaimer: string;
}

export interface DesignOption {
  id: string;
  projectId: string;
  position: number;
  name: string;
  strategy: string;
  summary: string;
  maintenanceScore: number;
  budgetBand: 'low' | 'medium' | 'high';
  biodiversityScore: number;
  plants: DesignPlantRecommendation[];
  workItems: DesignWorkItem[];
  ruleTrace: string[];
  visual: DesignVisual;
  status: 'draft' | 'selected' | 'rejected';
  createdAt: string;
  selectedAt: string | null;
}

export interface DesignProject {
  id: string;
  gardenId: string;
  targetFeatureId: string | null;
  inspirationId: string | null;
  versionNo: number;
  title: string;
  goal: DesignGoal;
  constraints: DesignConstraints;
  status: 'draft' | 'selected' | 'archived';
  options: DesignOption[];
  createdAt: string;
  updatedAt: string;
}

export interface DesignWorkspace {
  projects: DesignProject[];
  inspirations: DesignInspiration[];
  catalogSize: number;
  currentProjectId: string | null;
}

export interface ApiErrorBody { error: string; code?: string; details?: unknown; }
