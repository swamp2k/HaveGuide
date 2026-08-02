import { z } from 'zod';
import { CONFIDENCE_LEVELS, FEATURE_TYPES } from './constants';
import { geometrySchema } from './geojson';

export const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(10).max(256),
});

export const createGardenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
});

export const updateGardenSchema = createGardenSchema.partial();

export const createFeatureSchema = z.object({
  type: z.enum(FEATURE_TYPES),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(''),
  confidence: z.enum(CONFIDENCE_LEVELS).default('unknown'),
  geometry: geometrySchema,
});

export const updateFeatureSchema = createFeatureSchema.partial();

export const mediaMetadataSchema = z.object({
  gardenId: z.string().uuid(),
  featureId: z.string().uuid().optional(),
  note: z.string().trim().max(1000).optional().default(''),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
