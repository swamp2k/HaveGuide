export type SunExposure = 'full_sun' | 'part_sun' | 'shade';
export type Moisture = 'dry' | 'normal' | 'moist' | 'wet';
export type SoilType = 'sand' | 'loam' | 'clay' | 'mixed' | 'unknown';
export type Drainage = 'fast' | 'normal' | 'slow' | 'unknown';
export type WindExposure = 'sheltered' | 'normal' | 'exposed' | 'unknown';
export type PlantOrgan = 'auto' | 'leaf' | 'flower' | 'fruit' | 'bark' | 'habit' | 'other';
export type AnalysisMode = 'overview' | 'ideas' | 'problem';

export interface AreaProfile {
  sun: SunExposure | null;
  moisture: Moisture | null;
  soil: SoilType | null;
  drainage: Drainage | null;
  wind: WindExposure | null;
  notes: string;
  goals: string[];
}

export interface SceneImage {
  id: string;
  sceneId: string;
  kind: 'scene' | 'plant';
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
}

export interface PlantSuggestion {
  scientificName: string;
  commonName: string;
  score: number;
  gbifId: string | null;
}

export interface PlantIdentification {
  id: string;
  sceneId: string;
  imageId: string;
  organ: PlantOrgan;
  createdAt: string;
  suggestions: PlantSuggestion[];
}

export interface AiAnalysisPayload {
  summary: string;
  observations: string[];
  recommendations: string[];
  cautions: string[];
  followUpQuestions: string[];
}

export interface AiAnalysis {
  id: string;
  sceneId: string;
  imageId: string;
  mode: AnalysisMode;
  model: string;
  createdAt: string;
  payload: AiAnalysisPayload;
}

export interface GardenScene {
  id: string;
  title: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  profile: AreaProfile;
  images: SceneImage[];
  identifications: PlantIdentification[];
  analyses: AiAnalysis[];
}

export interface SceneSummary {
  id: string;
  title: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  profileComplete: boolean;
  image: SceneImage | null;
}
