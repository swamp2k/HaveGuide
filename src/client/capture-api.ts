import type { CaptureWorkspace } from '../shared/capture-types';
import type { z } from 'zod';
import type {
  createCaptureFrameSchema,
  createCaptureSessionSchema,
  updateCaptureSessionSchema,
  updateCaptureStationSchema,
  upsertCaptureHotspotSchema,
} from '../shared/capture-schemas';
import { ApiError } from './api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Forespørgslen mislykkedes.' })) as {
      error: string;
      code?: string;
    };
    throw new ApiError(body.error, response.status, body.code);
  }
  return response.json() as Promise<T>;
}

export const captureApi = {
  getWorkspace: (gardenId: string) =>
    request<{ workspace: CaptureWorkspace }>(`/api/gardens/${gardenId}/capture`),
  startSession: (gardenId: string, input: z.infer<typeof createCaptureSessionSchema>) =>
    request<{ sessionId: string; workspace: CaptureWorkspace }>(`/api/gardens/${gardenId}/capture/sessions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  addFrame: (
    gardenId: string,
    sessionId: string,
    input: z.infer<typeof createCaptureFrameSchema>,
  ) => request<{ workspace: CaptureWorkspace }>(
    `/api/gardens/${gardenId}/capture/sessions/${sessionId}/frames`,
    { method: 'POST', body: JSON.stringify(input) },
  ),
  updateSession: (
    gardenId: string,
    sessionId: string,
    input: z.infer<typeof updateCaptureSessionSchema>,
  ) => request<{ workspace: CaptureWorkspace }>(
    `/api/gardens/${gardenId}/capture/sessions/${sessionId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  ),
  updateStation: (
    gardenId: string,
    sessionId: string,
    stationNo: number,
    input: z.infer<typeof updateCaptureStationSchema>,
  ) => request<{ workspace: CaptureWorkspace }>(
    `/api/gardens/${gardenId}/capture/sessions/${sessionId}/stations/${stationNo}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  ),
  upsertHotspot: (
    gardenId: string,
    sessionId: string,
    frameId: string,
    input: z.infer<typeof upsertCaptureHotspotSchema>,
  ) => request<{ workspace: CaptureWorkspace }>(
    `/api/gardens/${gardenId}/capture/sessions/${sessionId}/frames/${frameId}/hotspots`,
    { method: 'PUT', body: JSON.stringify(input) },
  ),
  deleteHotspot: (
    gardenId: string,
    sessionId: string,
    frameId: string,
    featureId: string,
  ) => request<{ workspace: CaptureWorkspace }>(
    `/api/gardens/${gardenId}/capture/sessions/${sessionId}/frames/${frameId}/hotspots/${featureId}`,
    { method: 'DELETE' },
  ),
  reset: (gardenId: string) => request<{ deletedImages: number; workspace: CaptureWorkspace }>(
    `/api/gardens/${gardenId}/capture`,
    { method: 'DELETE' },
  ),
};
