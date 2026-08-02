import { z } from 'zod';

const positionSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const pointGeometrySchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
});

export const lineStringGeometrySchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(positionSchema).min(2),
});

export const polygonGeometrySchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(positionSchema).min(4)).min(1),
  })
  .superRefine((geometry, context) => {
    const ring = geometry.coordinates[0];
    const first = ring?.[0];
    const last = ring?.at(-1);
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Polygonringen skal være lukket.',
      });
    }
  });

export const geometrySchema = z.union([
  pointGeometrySchema,
  lineStringGeometrySchema,
  polygonGeometrySchema,
]);

export type GardenGeometry = z.infer<typeof geometrySchema>;
export type Position = z.infer<typeof positionSchema>;

export function closePolygon(coordinates: Position[]): Position[] {
  if (coordinates.length === 0) return coordinates;
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!first || !last) return coordinates;
  if (first[0] === last[0] && first[1] === last[1]) return coordinates;
  return [...coordinates, first];
}
