import type { GardenScanDraftFeature, GardenScanSpatialBounds, GardenScanVisionCandidate, GardenScanVisionClassification } from './native/garden-scan';
import { ApiError } from './api';
import { normalizeRuntimeUrls, runtimeUrl } from './runtime-url';

export type SmartScanReviewDecision = 'pending' | 'accepted' | 'rejected';

export interface SmartScanFeatureReview {
  featureId: string;
  decision: SmartScanReviewDecision;
  typeOverride: string | null;
  footprint: Array<[number, number]> | null;
  updatedAt: string;
}

export interface SmartScanStoredSession {
  id: string;
  gardenId: string;
  sessionId: string;
  coordinateFrame: string;
  bounds: ({ available?: boolean } & Partial<GardenScanSpatialBounds>) | Record<string, unknown>;
  draftFeatures: GardenScanDraftFeature[];
  reviewStatus: 'draft' | 'reviewing' | 'reviewed';
  createdAt: string;
  updatedAt: string;
  reviews: SmartScanFeatureReview[];
}

export interface SmartScanDriftKnot {
  position: number;
  offsetX: number;
  offsetZ: number;
}

export interface SmartScanDriftCorrection {
  axis: 'x' | 'z';
  knots: SmartScanDriftKnot[];
  baselineOutsideRatio: number;
}

export interface SmartScanAlignment {
  anchorLat: number;
  anchorLng: number;
  originX: number;
  originZ: number;
  rotationDegrees: number;
  scale: number;
  status: 'draft' | 'aligned';
  driftCorrection?: SmartScanDriftCorrection | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(runtimeUrl(path), { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'Forespørgslen mislykkedes.' }))) as { error: string; code?: string; details?: unknown };
    throw new ApiError(body.error, response.status, body.code, body.details);
  }
  return normalizeRuntimeUrls((await response.json()) as T);
}

export const smartScanApi = {
  classify: (
    gardenId: string,
    sessionId: string,
    candidates: GardenScanVisionCandidate[],
    force = false,
  ) => request<{ sessionId: string; classifications: GardenScanVisionClassification[]; cached: boolean }>(
    `/api/gardens/${gardenId}/smart-scan/classify`,
    { method: 'POST', body: JSON.stringify({ sessionId, candidates: candidates.slice(0, 16), force }) },
  ),

  saveSession: (
    gardenId: string,
    input: {
      sessionId: string;
      coordinateFrame: string;
      bounds?: ({ available?: boolean } & Partial<GardenScanSpatialBounds>) | Record<string, unknown>;
      draftFeatures: GardenScanDraftFeature[];
    },
  ) => request<{ session: SmartScanStoredSession }>(`/api/gardens/${gardenId}/smart-scan/sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  }),

  getSession: (gardenId: string, sessionId: string) => request<{ session: SmartScanStoredSession }>(
    `/api/gardens/${gardenId}/smart-scan/sessions/${encodeURIComponent(sessionId)}`,
  ),

  reviewFeature: (
    gardenId: string,
    sessionId: string,
    featureId: string,
    input: {
      decision: SmartScanReviewDecision;
      typeOverride?: string | null;
      footprint?: Array<[number, number]> | null;
    },
  ) => request<{ session: SmartScanStoredSession }>(
    `/api/gardens/${gardenId}/smart-scan/sessions/${encodeURIComponent(sessionId)}/features/${encodeURIComponent(featureId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  ),

  getAlignment: (gardenId: string, sessionId: string) => request<{ alignment: Partial<SmartScanAlignment>; status: 'unplaced' | 'draft' | 'aligned' }>(
    `/api/gardens/${gardenId}/smart-scan/sessions/${encodeURIComponent(sessionId)}/alignment`,
  ),

  saveAlignment: (gardenId: string, sessionId: string, alignment: SmartScanAlignment) => request<{ alignment: SmartScanAlignment; status: 'draft' | 'aligned' }>(
    `/api/gardens/${gardenId}/smart-scan/sessions/${encodeURIComponent(sessionId)}/alignment`,
    { method: 'PATCH', body: JSON.stringify(alignment) },
  ),
};
