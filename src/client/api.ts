import type { AreaProfile, GardenScene, PlantIdentification, SceneSummary } from '../shared/types';
import type { PasswordChallenge } from '../shared/auth';

interface ApiErrorBody { error?: { message?: string; code?: string; details?: unknown } }

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'API_ERROR', readonly details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    let body: ApiErrorBody = {};
    try { body = await response.json() as ApiErrorBody; } catch { /* ignore */ }
    throw new ApiError(body.error?.message ?? `HTTP ${response.status}`, response.status, body.error?.code, body.error?.details);
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<{ setupRequired: boolean; authenticated: boolean; user: { id: string; username: string } | null }>('/api/auth/bootstrap'),
  challenge: (username: string) => request<{ challenge: PasswordChallenge }>('/api/auth/challenge', { method: 'POST', body: JSON.stringify({ username }) }),
  setup: (body: { username: string; proof: string; salt: string; iterations: number; algorithm: string }) => request<{ user: { id: string; username: string } }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { username: string; proof: string }) => request<{ user: { id: string; username: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  capabilities: () => request<{ plantIdentification: boolean; aiAnalysis: boolean; imageEditing: boolean; imageEditingReason: string }>('/api/capabilities'),
  listScenes: () => request<{ scenes: SceneSummary[] }>('/api/scenes'),
  createScene: (title: string, notes = '') => request<{ scene: GardenScene }>('/api/scenes', { method: 'POST', body: JSON.stringify({ title, notes }) }),
  getScene: (id: string) => request<{ scene: GardenScene }>(`/api/scenes/${id}`),
  updateScene: (id: string, patch: { title?: string; notes?: string }) => request<{ scene: GardenScene }>(`/api/scenes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  saveProfile: (id: string, profile: AreaProfile) => request<{ profile: AreaProfile; profileComplete: boolean }>(`/api/scenes/${id}/profile`, { method: 'PUT', body: JSON.stringify(profile) }),
  uploadImage: async (id: string, file: File, kind: 'scene' | 'plant') => {
    const form = new FormData();
    form.append('image', file);
    form.append('kind', kind);
    return request<{ scene: GardenScene; imageId: string }>(`/api/scenes/${id}/images`, { method: 'POST', body: form });
  },
  identify: (sceneId: string, imageId: string, organ: string, meta: { nickname?: string; note?: string } = {}) =>
    request<{ id: string; suggestions: PlantIdentification['suggestions']; identification: PlantIdentification | null }>(
      `/api/scenes/${sceneId}/identify`,
      { method: 'POST', body: JSON.stringify({ imageId, organ, ...meta }) },
    ),
  updateIdentification: (
    sceneId: string,
    identificationId: string,
    patch: { nickname?: string; note?: string; includeInAnalysis?: boolean; selectedSuggestionIndex?: number },
  ) =>
    request<{ identification: PlantIdentification }>(
      `/api/scenes/${sceneId}/identifications/${identificationId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  rescanIdentification: (sceneId: string, identificationId: string, imageId: string, organ: string) =>
    request<{ identification: PlantIdentification }>(
      `/api/scenes/${sceneId}/identifications/${identificationId}/rescan`,
      { method: 'POST', body: JSON.stringify({ imageId, organ }) },
    ),
  deleteIdentification: (sceneId: string, identificationId: string) =>
    request<{ ok: boolean }>(`/api/scenes/${sceneId}/identifications/${identificationId}`, { method: 'DELETE' }),
  analyze: (sceneId: string, imageId: string, mode: 'overview' | 'ideas' | 'problem', question = '') => request<{ analysis: GardenScene['analyses'][number] }>(`/api/scenes/${sceneId}/analyze`, { method: 'POST', body: JSON.stringify({ imageId, mode, question }) }),
  deleteScene: (id: string) => request<{ ok: boolean }>(`/api/scenes/${id}`, { method: 'DELETE' }),
};
