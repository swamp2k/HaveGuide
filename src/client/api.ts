import type {
  ApiErrorBody,
  BootstrapResponse,
  Garden,
  GardenDetail,
  GardenFeature,
  MediaItem,
  UserSummary,
} from '../shared/types';
import type { z } from 'zod';
import type {
  createFeatureSchema,
  createGardenSchema,
  credentialsSchema,
  updateFeatureSchema,
  updateGardenSchema,
} from '../shared/schemas';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'Forespørgslen mislykkedes.' }))) as ApiErrorBody;
    throw new ApiError(body.error, response.status, body.code, body.details);
  }
  return (await response.json()) as T;
}

export const api = {
  bootstrap: () => request<BootstrapResponse>('/api/auth/bootstrap'),
  setup: (credentials: z.infer<typeof credentialsSchema>) =>
    request<{ user: UserSummary }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(credentials) }),
  login: (credentials: z.infer<typeof credentialsSchema>) =>
    request<{ user: UserSummary }>('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  listGardens: () => request<{ gardens: Garden[] }>('/api/gardens'),
  createGarden: (input: z.infer<typeof createGardenSchema>) =>
    request<{ garden: Garden }>('/api/gardens', { method: 'POST', body: JSON.stringify(input) }),
  getGarden: (gardenId: string) => request<{ garden: GardenDetail }>(`/api/gardens/${gardenId}`),
  updateGarden: (gardenId: string, input: z.infer<typeof updateGardenSchema>) =>
    request<{ garden: Garden }>(`/api/gardens/${gardenId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  createFeature: (gardenId: string, input: z.infer<typeof createFeatureSchema>) =>
    request<{ feature: GardenFeature }>(`/api/gardens/${gardenId}/features`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateFeature: (gardenId: string, featureId: string, input: z.infer<typeof updateFeatureSchema>) =>
    request<{ feature: GardenFeature }>(`/api/gardens/${gardenId}/features/${featureId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteFeature: (gardenId: string, featureId: string) =>
    request<{ ok: true }>(`/api/gardens/${gardenId}/features/${featureId}`, { method: 'DELETE' }),
  listMedia: (gardenId?: string) =>
    request<{ media: MediaItem[] }>(`/api/media${gardenId ? `?gardenId=${encodeURIComponent(gardenId)}` : ''}`),
  uploadMedia: (form: FormData) => request<{ media: MediaItem }>('/api/media', { method: 'POST', body: form }),
  deleteMedia: (mediaId: string) => request<{ ok: true }>(`/api/media/${mediaId}`, { method: 'DELETE' }),
};
