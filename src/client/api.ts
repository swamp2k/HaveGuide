import type { PasswordChallenge } from '../shared/auth';
import type {
  ApiErrorBody,
  BootstrapResponse,
  DesignWorkspace,
  Garden,
  GardenAssessment,
  GardenDetail,
  GardenFeature,
  GardenObservation,
  GardenPlant,
  GardenUnderstanding,
  GardenWalk,
  MediaItem,
  UserSummary,
} from '../shared/types';
import type { z } from 'zod';
import type {
  createAssessmentSchema,
  createDesignProjectSchema,
  createFeatureSchema,
  createGardenSchema,
  createObservationSchema,
  createPlantSchema,
  credentialsSchema,
  identifyPlantSchema,
  linkPlantMediaSchema,
  updateDesignVisualSchema,
  updateFeatureSchema,
  updateGardenSchema,
  updatePlantSchema,
  updateWalkSchema,
} from '../shared/schemas';
import type { GardenScanVisionCandidate, GardenScanVisionClassification } from './native/garden-scan';
import { createPasswordChallenge, derivePasswordProof } from './auth/password';
import { normalizeRuntimeUrls, runtimeUrl } from './runtime-url';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly details?: unknown) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(runtimeUrl(path), { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'Forespørgslen mislykkedes.' }))) as ApiErrorBody;
    throw new ApiError(body.error, response.status, body.code, body.details);
  }
  return normalizeRuntimeUrls((await response.json()) as T);
}

type Credentials = z.infer<typeof credentialsSchema>;

async function setup(credentials: Credentials): Promise<{ user: UserSummary }> {
  const challenge = createPasswordChallenge();
  const proof = await derivePasswordProof(credentials.password, challenge);
  return request<{ user: UserSummary }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({
      username: credentials.username,
      proof,
      salt: challenge.salt,
      iterations: challenge.iterations,
    }),
  });
}

async function login(credentials: Credentials): Promise<{ user: UserSummary }> {
  const response = await request<{ challenge: PasswordChallenge }>('/api/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ username: credentials.username }),
  });
  const proof = await derivePasswordProof(credentials.password, response.challenge);
  return request<{ user: UserSummary }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: credentials.username, proof }),
  });
}

export const api = {
  bootstrap: () => request<BootstrapResponse>('/api/auth/bootstrap'),
  setup,
  login,
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  listGardens: () => request<{ gardens: Garden[] }>('/api/gardens'),
  createGarden: (input: z.infer<typeof createGardenSchema>) => request<{ garden: Garden }>('/api/gardens', { method: 'POST', body: JSON.stringify(input) }),
  getGarden: (gardenId: string) => request<{ garden: GardenDetail }>(`/api/gardens/${gardenId}`),
  updateGarden: (gardenId: string, input: z.infer<typeof updateGardenSchema>) => request<{ garden: Garden }>(`/api/gardens/${gardenId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  createFeature: (gardenId: string, input: z.infer<typeof createFeatureSchema>) => request<{ feature: GardenFeature }>(`/api/gardens/${gardenId}/features`, { method: 'POST', body: JSON.stringify(input) }),
  updateFeature: (gardenId: string, featureId: string, input: z.infer<typeof updateFeatureSchema>) => request<{ feature: GardenFeature }>(`/api/gardens/${gardenId}/features/${featureId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteFeature: (gardenId: string, featureId: string) => request<{ ok: true }>(`/api/gardens/${gardenId}/features/${featureId}`, { method: 'DELETE' }),
  listMedia: (gardenId?: string) => request<{ media: MediaItem[] }>(`/api/media${gardenId ? `?gardenId=${encodeURIComponent(gardenId)}` : ''}`),
  uploadMedia: (form: FormData) => request<{ media: MediaItem }>('/api/media', { method: 'POST', body: form }),
  deleteMedia: (mediaId: string) => request<{ ok: true }>(`/api/media/${mediaId}`, { method: 'DELETE' }),
  getUnderstanding: (gardenId: string) => request<{ understanding: GardenUnderstanding }>(`/api/gardens/${gardenId}/understanding`),
  startWalk: (gardenId: string) => request<{ walk: GardenWalk }>(`/api/gardens/${gardenId}/walks`, { method: 'POST' }),
  updateWalk: (gardenId: string, walkId: string, input: z.infer<typeof updateWalkSchema>) => request<{ walk: GardenWalk }>(`/api/gardens/${gardenId}/walks/${walkId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  createObservation: (gardenId: string, input: z.infer<typeof createObservationSchema>) => request<{ observation: GardenObservation }>(`/api/gardens/${gardenId}/observations`, { method: 'POST', body: JSON.stringify(input) }),
  deleteObservation: (gardenId: string, observationId: string) => request<{ ok: true }>(`/api/gardens/${gardenId}/observations/${observationId}`, { method: 'DELETE' }),
  createPlant: (gardenId: string, input: z.infer<typeof createPlantSchema>) => request<{ plant: GardenPlant }>(`/api/gardens/${gardenId}/plants`, { method: 'POST', body: JSON.stringify(input) }),
  updatePlant: (gardenId: string, plantId: string, input: z.infer<typeof updatePlantSchema>) => request<{ ok: true }>(`/api/gardens/${gardenId}/plants/${plantId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deletePlant: (gardenId: string, plantId: string) => request<{ ok: true }>(`/api/gardens/${gardenId}/plants/${plantId}`, { method: 'DELETE' }),
  linkPlantMedia: (gardenId: string, plantId: string, input: z.infer<typeof linkPlantMediaSchema>) => request<{ ok: true }>(`/api/gardens/${gardenId}/plants/${plantId}/media`, { method: 'POST', body: JSON.stringify(input) }),
  identifyPlant: (gardenId: string, plantId: string, input: z.infer<typeof identifyPlantSchema> = {}) => request<{ requestId: string; suggestions: unknown[] }>(`/api/gardens/${gardenId}/plants/${plantId}/identify`, { method: 'POST', body: JSON.stringify(input) }),
  decideSuggestion: (gardenId: string, suggestionId: string, action: 'accept' | 'reject') => request<{ ok: true }>(`/api/gardens/${gardenId}/suggestions/${suggestionId}/decision`, { method: 'POST', body: JSON.stringify({ action }) }),
  mergePlants: (gardenId: string, plantId: string, duplicatePlantId: string) => request<{ ok: true }>(`/api/gardens/${gardenId}/plants/${plantId}/merge`, { method: 'POST', body: JSON.stringify({ duplicatePlantId }) }),
  createAssessment: (gardenId: string, input: z.infer<typeof createAssessmentSchema>) => request<{ assessment: GardenAssessment }>(`/api/gardens/${gardenId}/assessments`, { method: 'POST', body: JSON.stringify(input) }),
  classifySmartScanCandidates: (gardenId: string, sessionId: string, candidates: GardenScanVisionCandidate[]) =>
    request<{ sessionId: string; classifications: GardenScanVisionClassification[] }>(`/api/gardens/${gardenId}/smart-scan/classify`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, candidates }),
    }),
  getDesignWorkspace: (gardenId: string) => request<{ workspace: DesignWorkspace }>(`/api/gardens/${gardenId}/design`),
  createDesignProject: (gardenId: string, input: z.infer<typeof createDesignProjectSchema>) => request<{ workspace: DesignWorkspace }>(`/api/gardens/${gardenId}/design/projects`, { method: 'POST', body: JSON.stringify(input) }),
  selectDesignOption: (gardenId: string, projectId: string, optionId: string) => request<{ workspace: DesignWorkspace }>(`/api/gardens/${gardenId}/design/projects/${projectId}/select`, { method: 'POST', body: JSON.stringify({ optionId }) }),
  updateDesignVisual: (gardenId: string, optionId: string, input: z.infer<typeof updateDesignVisualSchema>) => request<{ workspace: DesignWorkspace }>(`/api/gardens/${gardenId}/design/options/${optionId}/visual`, { method: 'PATCH', body: JSON.stringify(input) }),
  archiveDesignProject: (gardenId: string, projectId: string) => request<{ workspace: DesignWorkspace }>(`/api/gardens/${gardenId}/design/projects/${projectId}`, { method: 'DELETE' }),
};
