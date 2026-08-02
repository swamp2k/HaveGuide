import type { CONFIDENCE_LEVELS, FEATURE_TYPES } from './constants';
import type { GardenGeometry } from './geojson';

export type FeatureType = (typeof FEATURE_TYPES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface UserSummary {
  id: string;
  username: string;
}

export interface BootstrapResponse {
  setupRequired: boolean;
  authenticated: boolean;
  user: UserSummary | null;
}

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

export interface GardenDetail extends Garden {
  features: GardenFeature[];
}

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

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
