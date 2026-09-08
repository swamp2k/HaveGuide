import { z } from 'zod';
import { PASSWORD_KDF, PASSWORD_KDF_ITERATIONS } from './auth';

export const passwordChallengeRequestSchema = z.object({
  username: z.string().trim().min(1).max(80),
});

export const passwordSetupSchema = z.object({
  username: z.string().trim().min(2).max(80),
  proof: z.string().min(20),
  salt: z.string().min(10),
  iterations: z.literal(PASSWORD_KDF_ITERATIONS),
  algorithm: z.literal(PASSWORD_KDF),
});

export const passwordLoginSchema = passwordSetupSchema.pick({ username: true, proof: true });

export const sceneCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).default(''),
});

export const sceneUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const areaProfileSchema = z.object({
  sun: z.enum(['full_sun', 'part_sun', 'shade']).nullable(),
  moisture: z.enum(['dry', 'normal', 'moist', 'wet']).nullable(),
  soil: z.enum(['sand', 'loam', 'clay', 'mixed', 'unknown']).nullable(),
  drainage: z.enum(['fast', 'normal', 'slow', 'unknown']).nullable(),
  wind: z.enum(['sheltered', 'normal', 'exposed', 'unknown']).nullable(),
  notes: z.string().trim().max(3000),
  goals: z.array(z.string().trim().min(1).max(80)).max(12),
});

export const identifyPlantSchema = z.object({
  imageId: z.string().min(1),
  organ: z.enum(['auto', 'leaf', 'flower', 'fruit', 'bark', 'habit', 'other']).default('auto'),
  nickname: z.string().trim().max(60).optional(),
  note: z.string().trim().max(240).optional(),
});

export const analyzeSceneSchema = z.object({
  imageId: z.string().min(1),
  mode: z.enum(['overview', 'ideas', 'problem']),
  question: z.string().trim().max(1200).optional().default(''),
});

export const identificationUpdateSchema = z
  .object({
    nickname: z.string().trim().max(60).optional(),
    note: z.string().trim().max(240).optional(),
    includeInAnalysis: z.boolean().optional(),
    selectedSuggestionIndex: z.number().int().min(0).max(4).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Ingen ændringer.',
  });

export const identificationRescanSchema = z.object({
  imageId: z.string().min(1),
  organ: z.enum(['auto', 'leaf', 'flower', 'fruit', 'bark', 'habit', 'other']).default('auto'),
});

export const visualizationCreateSchema = z.object({
  sourceImageId: z.string().min(1),
  instruction: z.string().trim().min(3).max(600),
});
