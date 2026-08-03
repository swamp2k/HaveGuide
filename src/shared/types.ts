import type {
  ASSESSMENT_CATEGORIES,
  CONFIDENCE_LEVELS,
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

export interface ApiErrorBody { error: string; code?: string; details?: unknown; }
