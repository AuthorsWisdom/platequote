import { z } from "zod";

export const purposeSchema = z.enum(["general", "looks", "outdoor", "heat", "flex"]);

/** Prisma `@default(cuid())` ids. Rejects anything else before it reaches the database. */
export const recordIdSchema = z.string().regex(/^c[a-z0-9]{20,32}$/);

export const shopUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  minimumOrder: z.number().min(0).max(10_000),
  rushFee: z.number().min(0).max(10_000),
  estimateTolerancePct: z.number().int().min(5).max(50),
  printers: z
    .array(
      z.object({
        id: recordIdSchema.optional(),
        name: z.string().trim().min(1).max(80),
        bedXmm: z.number().min(50).max(1000),
        bedYmm: z.number().min(50).max(1000),
        bedZmm: z.number().min(50).max(1000),
        isDefault: z.boolean(),
      }),
    )
    .min(1)
    .max(12),
  materials: z
    .array(
      z.object({
        id: recordIdSchema.optional(),
        name: z.string().trim().min(1).max(40),
        pricePerGram: z.number().positive().max(10),
        pricePerMachineHour: z.number().min(0).max(500),
        densityGPerCm3: z.number().min(0.5).max(3),
        colors: z.array(z.string().trim().min(1).max(30)).min(1).max(12),
      }),
    )
    .min(1)
    .max(20),
});

export const orderStatusSchema = z.object({
  status: z.enum(["printing", "shipped"]),
});

export const repriceSchema = z.object({
  materialId: recordIdSchema,
  color: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(1).max(100),
  rush: z.boolean(),
  purpose: purposeSchema,
});
