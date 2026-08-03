import type { GardenJourney } from '../shared/journey-types';
import type { z } from 'zod';
import type {
  createChangeSchema,
  createShoppingItemSchema,
  createTaskSchema,
  updateShoppingItemSchema,
  updateTaskSchema,
} from '../shared/journey-schemas';
import { ApiError } from './api';

async function request(path: string, init?: RequestInit): Promise<{ journey: GardenJourney }> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Forespørgslen mislykkedes.' })) as { error: string; code?: string };
    throw new ApiError(body.error, response.status, body.code);
  }
  return response.json() as Promise<{ journey: GardenJourney }>;
}

export const journeyApi = {
  get: (gardenId: string) => request(`/api/gardens/${gardenId}/journey`),
  createTask: (gardenId: string, input: z.infer<typeof createTaskSchema>) => request(`/api/gardens/${gardenId}/tasks`, { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (gardenId: string, taskId: string, input: z.infer<typeof updateTaskSchema>) => request(`/api/gardens/${gardenId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  createChange: (gardenId: string, input: z.infer<typeof createChangeSchema>) => request(`/api/gardens/${gardenId}/changes`, { method: 'POST', body: JSON.stringify(input) }),
  createShopping: (gardenId: string, input: z.infer<typeof createShoppingItemSchema>) => request(`/api/gardens/${gardenId}/shopping`, { method: 'POST', body: JSON.stringify(input) }),
  updateShopping: (gardenId: string, itemId: string, input: z.infer<typeof updateShoppingItemSchema>) => request(`/api/gardens/${gardenId}/shopping/${itemId}`, { method: 'PATCH', body: JSON.stringify(input) }),
};
