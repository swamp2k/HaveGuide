import { z } from 'zod';
import {
  ASSESSMENT_CATEGORIES,
  CONFIDENCE_LEVELS,
  DESIGN_BUDGET_LEVELS,
  DESIGN_COLORS,
  DESIGN_EFFORT_LEVELS,
  DESIGN_GOALS,
  FEATURE_TYPES,
  OBSERVATION_KINDS,
  PLANT_ORGANS,
  WALK_STEPS,
} from './constants';
import { PASSWORD_KDF_ITERATIONS } from './auth';
import { geometrySchema } from './geojson';

export const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(10).max(256),
});

const usernameSchema = z.string().trim().min(3).max(64);
const passwordProofSchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'Ugyldigt passwordbevis.');
const passwordSaltSchema = z.string().regex(/^[A-Za-z0-9+/]{22}==$/, 'Ugyldigt salt.');

export const passwordChallengeRequestSchema = z.object({ username: usernameSchema });
export const passwordSetupSchema = z.object({
  username: usernameSchema,
  proof: passwordProofSchema,
  salt: passwordSaltSchema,
  iterations: z.literal(PASSWORD_KDF_ITERATIONS),
});
export const passwordLoginSchema = z.object({ username: usernameSchema, proof: passwordProofSchema });

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

const optionalCoordinate = z.number().finite();
const observationBaseSchema = z.object({
  featureId: z.string().uuid().optional(),
  kind: z.enum(OBSERVATION_KINDS),
  title: z.string().trim().min(1).max(140),
  notes: z.string().trim().max(2000).optional().default(''),
  latitude: optionalCoordinate.min(-90).max(90).optional(),
  longitude: optionalCoordinate.min(-180).max(180).optional(),
  bearingDegrees: optionalCoordinate.min(0).max(360).optional(),
  environment: z.record(z.string().trim().max(200)).optional().default({}),
});
function coordinatesTogether(value: { latitude?: number; longitude?: number }, context: z.RefinementCtx) {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Både bredde- og længdegrad skal angives.' });
  }
}
export const createObservationSchema = observationBaseSchema.superRefine(coordinatesTogether);
export const updateObservationSchema = observationBaseSchema.partial().superRefine(coordinatesTogether);

const plantBaseSchema = z.object({
  featureId: z.string().uuid().optional(),
  commonName: z.string().trim().max(160).optional().default(''),
  scientificName: z.string().trim().max(200).optional().default(''),
  identificationStatus: z.enum(['unidentified', 'confirmed', 'manual']).optional().default('unidentified'),
  confidence: z.enum(CONFIDENCE_LEVELS).optional().default('unknown'),
  notes: z.string().trim().max(2000).optional().default(''),
  latitude: optionalCoordinate.min(-90).max(90).optional(),
  longitude: optionalCoordinate.min(-180).max(180).optional(),
});
export const createPlantSchema = plantBaseSchema.superRefine(coordinatesTogether);
export const updatePlantSchema = plantBaseSchema.partial().superRefine(coordinatesTogether);
export const linkPlantMediaSchema = z.object({ mediaId: z.string().uuid(), organ: z.enum(PLANT_ORGANS).default('auto') });
export const identifyPlantSchema = z.object({ mediaIds: z.array(z.string().uuid()).min(1).max(5).optional() });

export const createAssessmentSchema = z.object({
  category: z.enum(ASSESSMENT_CATEGORIES),
  value: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional().default(''),
  geometry: geometrySchema.nullable().optional().default(null),
});
export const updateAssessmentSchema = createAssessmentSchema.partial();

export const updateWalkSchema = z.object({
  currentStep: z.number().int().min(0).max(WALK_STEPS.length - 1).optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
});
export const suggestionDecisionSchema = z.object({ action: z.enum(['accept', 'reject']) });
export const mergePlantsSchema = z.object({ duplicatePlantId: z.string().uuid() });

const designConstraintsSchema = z.object({
  effort: z.enum(DESIGN_EFFORT_LEVELS).default('low'),
  budget: z.enum(DESIGN_BUDGET_LEVELS).default('flexible'),
  childrenUseGarden: z.boolean().default(false),
  petsUseGarden: z.boolean().default(false),
  avoidPotentiallyHarmful: z.boolean().default(true),
  colors: z.array(z.enum(DESIGN_COLORS)).max(DESIGN_COLORS.length).default([]),
  maxHeightCm: z.number().int().min(10).max(1000).nullable().default(null),
  winterInterest: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().default(''),
});

const designInspirationInputSchema = z.object({
  mediaId: z.string().uuid().optional(),
  sourceUrl: z.string().trim().max(500).optional().default(''),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(2000).optional().default(''),
  styleTags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  desiredElements: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  avoidedElements: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

export const createDesignProjectSchema = z.object({
  targetFeatureId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  goal: z.enum(DESIGN_GOALS),
  constraints: designConstraintsSchema,
  inspiration: designInspirationInputSchema.optional(),
});

export const selectDesignOptionSchema = z.object({ optionId: z.string().uuid() });
export const updateDesignVisualSchema = z.object({ backgroundMediaId: z.string().uuid().nullable() });
