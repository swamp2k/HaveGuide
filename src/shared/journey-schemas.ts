import { z } from 'zod';

export const createTaskSchema = z.object({
  featureId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().default(''),
  season: z.enum(['spring', 'summer', 'autumn', 'winter', 'any']).default('any'),
  dueDate: z.string().date().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export const updateTaskSchema = z.object({
  status: z.enum(['open', 'done', 'skipped']).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  dueDate: z.string().date().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export const createChangeSchema = z.object({
  featureId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(3000).optional().default(''),
  occurredOn: z.string().date(),
  beforeMediaId: z.string().uuid().optional(),
  afterMediaId: z.string().uuid().optional(),
  costMinor: z.number().int().min(0).max(100_000_000).default(0),
});

export const createShoppingItemSchema = z.object({
  designProjectId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(100000).default(1),
  unit: z.string().trim().min(1).max(40).default('stk'),
  estimatedUnitPriceMinor: z.number().int().min(0).max(100_000_000).default(0),
  supplier: z.string().trim().max(160).optional().default(''),
  url: z.string().trim().url().max(1000).optional().or(z.literal('')).default(''),
});

export const updateShoppingItemSchema = z.object({
  status: z.enum(['planned', 'bought', 'skipped']).optional(),
  actualUnitPriceMinor: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
