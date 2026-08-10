import { z } from 'zod';

export const createCaptureSessionSchema = z.object({
  title: z.string().trim().min(1).max(160).default('Guidet rundtur'),
  mode: z.enum(['perimeter', 'panorama', 'zone']).default('perimeter'),
  targetFeatureId: z.string().uuid().optional(),
  targetOverlapPercent: z.number().int().min(15).max(70).default(35),
});

export const createCaptureFrameSchema = z.object({
  mediaId: z.string().uuid(),
  latitude: z.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().min(-180).max(180).nullable().optional().default(null),
  accuracyM: z.number().min(0).max(5000).nullable().optional().default(null),
  bearingDegrees: z.number().min(0).max(360).nullable().optional().default(null),
  capturedAt: z.string().datetime().optional(),
});

export const updateCaptureSessionSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
});

export const updateCaptureStationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const upsertCaptureHotspotSchema = z.object({
  featureId: z.string().uuid(),
  xNorm: z.number().min(0).max(1),
  yNorm: z.number().min(0).max(1),
});
