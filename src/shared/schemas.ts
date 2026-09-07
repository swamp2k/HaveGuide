import { z } from 'zod';
import { PASSWORD_KDF, PASSWORD_KDF_ITERATIONS } from './auth';

export const passwordChallengeRequestSchema = z.object({ username: z.string().trim().min(1).max(80) });
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

const nullableEnum = <T extends [string, ...string[]]>(values: T) => z.enum(values).nullable();

export const areaProfileSchema = z.object({
  sun: nullableEnum(['full_sun', 'part_sun', 'shade']),
  moisture: nullableEnum(['dry', 'normal', 'moist', 'wet']),
  soil: nullableEnum(['sand', 'loam', 'clay', 'mixed', 'unknown']),
  drainage: nullableEnum(['fast', 'normal', 'slow', 'unknown']),
  wind: nullableEnum(['sheltered', 'normal', 'exposed', 'unknown']),
  notes: z.string().trim().max(3000),
  goals: z.array(z.string().trim().min(1).max(80)).max(12),
});

export const identifyPlantSchema = z.object({
  imageId: z.string().min(1),
  organ: z.enum(['auto', 'leaf', 'flower', 'fruit', 'bark', 'habit', 'other']).default('auto'),
});

export const analyzeSceneSchema = z.object({
  imageId: z.string().min(1),
  mode: z.enum(['overview', 'ideas', 'problem']),
  question: z.string().trim().max(1200).optional().default(''),
});
