import { z } from "zod";

export const boundingBoxSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  z: z.number().nonnegative(),
});

export const meshFactsSchema = z.object({
  watertight: z.boolean(),
  volumeCm3: z.number().nullable(),
  surfaceAreaCm2: z.number().nonnegative(),
  overhangFaceShare: z.number().min(0).max(1),
  overhangThresholdDeg: z.number(),
  thinWall: z.boolean(),
  characteristicThicknessMm: z.number().nullable(),
  fitsBed: z.boolean(),
  fitsIfRotated: z.boolean(),
  partCount: z.number().int().positive(),
  triangleCount: z.number().int().nonnegative(),
  boundingBoxMm: boundingBoxSchema,
});

export const slicerSuccessSchema = z.object({
  ok: z.literal(true),
  engine: z.string().min(1),
  engineVersion: z.string().min(1),
  profileName: z.string().min(1),
  filamentGrams: z.number().nonnegative(),
  filamentCm3: z.number().nonnegative(),
  printTimeSeconds: z.number().int().nonnegative(),
  supports: z.boolean(),
  boundingBoxMm: boundingBoxSchema,
  filamentDensityGPerCm3: z.number().positive(),
  mesh: meshFactsSchema,
});

export const slicerFailureSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
  message: z.string().min(1),
  mesh: meshFactsSchema.nullable(),
});

export const slicerResponseSchema = z.discriminatedUnion("ok", [
  slicerSuccessSchema,
  slicerFailureSchema,
]);

export type MeshFacts = z.infer<typeof meshFactsSchema>;
export type SlicerSuccess = z.infer<typeof slicerSuccessSchema>;
export type SlicerResponse = z.infer<typeof slicerResponseSchema>;

export function parseSlicerResult(input: unknown): SlicerResponse {
  return slicerResponseSchema.parse(input);
}
