import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { attachEnginePrices } from "@/lib/ai/price-advice";
import { reviewPrint } from "@/lib/ai/review";
import { prisma } from "@/lib/db";
import { gramsForMaterial, priceQuote, type PriceBreakdown } from "@/lib/pricing";
import { toPublicOrder } from "@/lib/public-order";
import { meshFactsSchema, parseSlicerResult, type SlicerResponse } from "@/lib/slicer-result";
import { getShopRecord, toMaterialDTO, toPrinterDTO } from "@/lib/shop";
import type { MeshFactsDTO, OrderStatus, PriceBreakdownDTO, QuoteDTO, StoredReview } from "@/lib/types";
import { inspectUpload, resolveStoredUpload } from "@/lib/uploads";
import { workerHeaders, workerMisconfigured } from "@/lib/worker-auth";

const quoteInclude = {
  material: true,
  printer: true,
  order: true,
  shop: true,
} satisfies Prisma.QuoteInclude;

type QuoteRecord = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

export function uploadDirectory(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

export function workerBaseUrl(): string {
  const raw = (process.env.SLICER_WORKER_URL || "http://127.0.0.1:8091").trim();
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  return `http://${raw}`;
}

function asOrderStatus(value: string): OrderStatus {
  if (value === "paid" || value === "printing" || value === "shipped") return value;
  return "quoted";
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function readMesh(value: Prisma.JsonValue): MeshFactsDTO | null {
  const parsed = meshFactsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readBreakdown(value: Prisma.JsonValue): PriceBreakdownDTO | null {
  const record = asRecord(value);
  if (!record || typeof record.totalCents !== "number") return null;
  return record as PriceBreakdownDTO;
}

function readReview(value: Prisma.JsonValue): StoredReview | null {
  const record = asRecord(value);
  if (!record || !record.review || !Array.isArray(record.materialQuotes)) return null;
  return record as StoredReview;
}

export function toQuoteDTO(quote: QuoteRecord): QuoteDTO {
  const slicer = asRecord(quote.slicerResult);
  return {
    id: quote.id,
    status: quote.status === "quoted" || quote.status === "failed" ? quote.status : "slicing",
    shopName: quote.shop.name,
    estimateTolerancePct: quote.shop.estimateTolerancePct,
    originalFilename: quote.originalFilename,
    color: quote.color,
    quantity: quote.quantity,
    rush: quote.rush,
    purpose: quote.purpose,
    material: toMaterialDTO(quote.material),
    printer: quote.printer ? toPrinterDTO(quote.printer) : null,
    filamentGrams: quote.filamentGrams,
    filamentCm3: quote.filamentCm3,
    slicedDensity: quote.slicedDensity,
    printTimeSeconds: quote.printTimeSeconds,
    supports: quote.supports,
    profileName: typeof slicer?.profileName === "string" ? slicer.profileName : null,
    engine: typeof slicer?.engine === "string" ? slicer.engine : null,
    mesh: readMesh(quote.meshFacts),
    priceCents: quote.priceCents,
    priceBreakdown: readBreakdown(quote.priceBreakdown),
    review: readReview(quote.aiReview),
    errorMessage: quote.errorMessage,
    createdAt: quote.createdAt.toISOString(),
    order: quote.order
      ? toPublicOrder({
          id: quote.order.id,
          status: asOrderStatus(quote.order.status),
          amountCents: quote.order.amountCents,
          paypalOrderId: quote.order.paypalOrderId,
          paypalCaptureId: quote.order.paypalCaptureId,
          paypalEnv: quote.order.paypalEnv,
          payerEmail: quote.order.payerEmail,
          paidAt: quote.order.paidAt?.toISOString() ?? null,
        })
      : null,
  };
}

async function loadQuote(id: string) {
  return prisma.quote.findUnique({ where: { id }, include: quoteInclude });
}

export async function getQuote(id: string): Promise<QuoteDTO | null> {
  const quote = await loadQuote(id);
  return quote ? toQuoteDTO(quote) : null;
}

export async function quoteModelFile(id: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return null;
  const full = resolveStoredUpload(uploadDirectory(), quote.storedFilename);
  if (!full) return null;
  return { full, filename: quote.originalFilename, stored: quote.storedFilename };
}

async function sliceUpload(input: {
  bytes: Buffer;
  extension: ".stl" | ".3mf";
  materialSlug: string;
  density: number;
  bedXmm: number;
  bedYmm: number;
  bedZmm: number;
}): Promise<SlicerResponse> {
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(input.bytes)]), `model${input.extension}`);
  body.append("material", input.materialSlug);
  body.append("density", String(input.density));
  body.append("bed_x", String(input.bedXmm));
  body.append("bed_y", String(input.bedYmm));
  body.append("bed_z", String(input.bedZmm));
  if (workerMisconfigured()) {
    return {
      ok: false,
      error: "worker_unauthorized",
      message: "The slicing worker secret is not configured on this host.",
      mesh: null,
    };
  }
  let response: Response;
  try {
    response = await fetch(`${workerBaseUrl()}/slice`, {
      method: "POST",
      headers: workerHeaders(),
      body,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return {
      ok: false,
      error: "worker_unreachable",
      message: "The slicing worker is not reachable. Start it with docker compose and try again.",
      mesh: null,
    };
  }
  if (response.status === 401 || response.status === 503) {
    return {
      ok: false,
      error: "worker_unauthorized",
      message: "The slicing worker refused the shared token. Check SLICER_WORKER_TOKEN on both services.",
      mesh: null,
    };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return {
      ok: false,
      error: "worker_bad_response",
      message: "The slicing worker returned something that was not JSON.",
      mesh: null,
    };
  }
  try {
    return parseSlicerResult(json);
  } catch {
    return {
      ok: false,
      error: "worker_bad_response",
      message: "The slicing worker returned JSON that does not match the quote contract.",
      mesh: null,
    };
  }
}

function priceFromSlicer(input: {
  filamentGrams: number;
  filamentCm3: number;
  slicedDensity: number;
  printTimeSeconds: number;
  targetDensity: number;
  pricePerGram: number;
  pricePerMachineHour: number;
  quantity: number;
  minimumOrder: number;
  rush: boolean;
  rushFee: number;
}): PriceBreakdown {
  const grams = gramsForMaterial({
    filamentCm3: input.filamentCm3,
    filamentGrams: input.filamentGrams,
    slicedDensity: input.slicedDensity,
    targetDensity: input.targetDensity,
  });
  return {
    ...priceQuote({
      filamentGrams: grams.grams,
      printTimeSeconds: input.printTimeSeconds,
      quantity: input.quantity,
      pricePerGram: input.pricePerGram,
      pricePerMachineHour: input.pricePerMachineHour,
      minimumOrder: input.minimumOrder,
      rush: input.rush,
      rushFee: input.rushFee,
    }),
    gramsSource: grams.source,
  };
}

export async function createQuote(input: {
  bytes: Buffer;
  filename: string;
  materialId: string;
  printerId: string | null;
  color: string;
  quantity: number;
  rush: boolean;
  purpose: string;
}): Promise<QuoteDTO> {
  const inspected = inspectUpload(input.filename, input.bytes);
  if (!inspected.ok) throw new QuoteInputError(inspected.message);
  const extension = inspected.extension;

  const shop = await getShopRecord();
  const material = shop.materials.find((item) => item.id === input.materialId);
  if (!material) throw new QuoteInputError("Choose a material this shop stocks.");
  const colors = Array.isArray(material.colors) ? material.colors : [];
  if (!colors.includes(input.color)) throw new QuoteInputError("Choose a color for that material.");
  const printer =
    shop.printers.find((item) => item.id === input.printerId) ??
    shop.printers.find((item) => item.isDefault) ??
    shop.printers[0];
  if (!printer) throw new QuoteInputError("Add a printer before quoting.");

  const storedFilename = `${randomUUID()}${extension}`;
  await mkdir(uploadDirectory(), { recursive: true });
  await writeFile(path.join(uploadDirectory(), storedFilename), input.bytes);

  const created = await prisma.quote.create({
    data: {
      shopId: shop.id,
      materialId: material.id,
      printerId: printer.id,
      status: "slicing",
      originalFilename: inspected.filename,
      storedFilename,
      color: input.color,
      quantity: input.quantity,
      rush: input.rush,
      purpose: input.purpose,
    },
  });

  const sliced = await sliceUpload({
    bytes: input.bytes,
    extension,
    materialSlug: material.slug,
    density: material.densityGPerCm3,
    bedXmm: printer.bedXmm,
    bedYmm: printer.bedYmm,
    bedZmm: printer.bedZmm,
  });

  const materialDTO = toMaterialDTO(material);
  const review = await reviewPrint({
    purpose: input.purpose,
    selectedMaterial: material.name,
    quantity: input.quantity,
    bed: { x: printer.bedXmm, y: printer.bedYmm, z: printer.bedZmm },
    mesh: sliced.mesh,
    slicer: sliced.ok
      ? {
          filamentGrams: sliced.filamentGrams,
          filamentCm3: sliced.filamentCm3,
          printTimeSeconds: sliced.printTimeSeconds,
          supports: sliced.supports,
          profileName: sliced.profileName,
          engine: sliced.engine,
        }
      : null,
    shopMaterialNames: shop.materials.map((item) => item.name),
    mockReason: null,
  });

  let breakdown: PriceBreakdown | null = null;
  let materialQuotes = review.materialAdvice.map((item) => ({
    ...item,
    materialId: null as string | null,
    defaultColor: null as string | null,
    priceCents: null as number | null,
    priceSource: null as "pricing_engine" | null,
    unavailable: false,
  }));
  if (sliced.ok) {
    breakdown = priceFromSlicer({
      filamentGrams: sliced.filamentGrams,
      filamentCm3: sliced.filamentCm3,
      slicedDensity: sliced.filamentDensityGPerCm3,
      printTimeSeconds: sliced.printTimeSeconds,
      targetDensity: material.densityGPerCm3,
      pricePerGram: materialDTO.pricePerGram,
      pricePerMachineHour: materialDTO.pricePerMachineHour,
      quantity: input.quantity,
      minimumOrder: Number(shop.minimumOrder),
      rush: input.rush,
      rushFee: Number(shop.rushFee),
    });
    materialQuotes = attachEnginePrices({
      advice: review.materialAdvice,
      rates: shop.materials.map(toMaterialDTO),
      filamentGrams: sliced.filamentGrams,
      filamentCm3: sliced.filamentCm3,
      slicedDensity: sliced.filamentDensityGPerCm3,
      printTimeSeconds: sliced.printTimeSeconds,
      quantity: input.quantity,
      minimumOrder: Number(shop.minimumOrder),
      rush: input.rush,
      rushFee: Number(shop.rushFee),
    });
  }

  const storedReview: StoredReview = { review, materialQuotes };
  await prisma.quote.update({
    where: { id: created.id },
    data: {
      status: sliced.ok ? "quoted" : "failed",
      filamentGrams: sliced.ok ? sliced.filamentGrams : null,
      filamentCm3: sliced.ok ? sliced.filamentCm3 : null,
      slicedDensity: sliced.ok ? sliced.filamentDensityGPerCm3 : null,
      printTimeSeconds: sliced.ok ? sliced.printTimeSeconds : null,
      supports: sliced.ok ? sliced.supports : null,
      meshFacts: sliced.mesh ?? undefined,
      slicerResult: sliced.ok ? sliced : undefined,
      aiReview: storedReview,
      priceCents: breakdown?.totalCents ?? null,
      priceBreakdown: breakdown ?? undefined,
      errorMessage: sliced.ok ? null : sliced.message,
    },
  });

  if (breakdown) {
    await prisma.order.create({
      data: {
        shopId: shop.id,
        quoteId: created.id,
        status: "quoted",
        amountCents: breakdown.totalCents,
        currency: "USD",
      },
    });
  }

  const quote = await loadQuote(created.id);
  if (!quote) throw new Error("Quote disappeared after it was saved.");
  return toQuoteDTO(quote);
}

export async function repriceQuote(
  id: string,
  input: { materialId: string; color: string; quantity: number; rush: boolean; purpose: string },
): Promise<QuoteDTO> {
  const quote = await loadQuote(id);
  if (!quote) throw new QuoteInputError("Quote not found.");
  if (quote.status !== "quoted" || quote.filamentGrams == null || quote.printTimeSeconds == null) {
    throw new QuoteInputError("Only a finished quote can be repriced.");
  }
  if (quote.order && quote.order.status !== "quoted") {
    throw new QuoteInputError("This job is already paid, so the price is locked.");
  }
  const shop = await getShopRecord();
  const material = shop.materials.find((item) => item.id === input.materialId);
  if (!material) throw new QuoteInputError("Choose a material this shop stocks.");
  const colors = Array.isArray(material.colors) ? material.colors : [];
  if (!colors.includes(input.color)) throw new QuoteInputError("Choose a color for that material.");
  if (quote.slicedDensity == null) throw new QuoteInputError("This quote is missing its sliced density.");

  const materialDTO = toMaterialDTO(material);
  const breakdown = priceFromSlicer({
    filamentGrams: quote.filamentGrams,
    filamentCm3: quote.filamentCm3 ?? 0,
    slicedDensity: quote.slicedDensity,
    printTimeSeconds: quote.printTimeSeconds,
    targetDensity: material.densityGPerCm3,
    pricePerGram: materialDTO.pricePerGram,
    pricePerMachineHour: materialDTO.pricePerMachineHour,
    quantity: input.quantity,
    minimumOrder: Number(shop.minimumOrder),
    rush: input.rush,
    rushFee: Number(shop.rushFee),
  });

  const existing = readReview(quote.aiReview);
  const advice = existing?.review.materialAdvice ?? [];
  const materialQuotes = advice.length
    ? attachEnginePrices({
        advice,
        rates: shop.materials.map(toMaterialDTO),
        filamentGrams: quote.filamentGrams,
        filamentCm3: quote.filamentCm3,
        slicedDensity: quote.slicedDensity,
        printTimeSeconds: quote.printTimeSeconds,
        quantity: input.quantity,
        minimumOrder: Number(shop.minimumOrder),
        rush: input.rush,
        rushFee: Number(shop.rushFee),
      })
    : [];

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      materialId: material.id,
      color: input.color,
      quantity: input.quantity,
      rush: input.rush,
      purpose: input.purpose,
      priceCents: breakdown.totalCents,
      priceBreakdown: breakdown,
      aiReview: existing ? { review: existing.review, materialQuotes } : undefined,
    },
  });
  if (quote.order) {
    await prisma.order.update({
      where: { id: quote.order.id },
      data: {
        amountCents: breakdown.totalCents,
        paypalOrderId: null,
      },
    });
  }
  const updated = await loadQuote(id);
  if (!updated) throw new Error("Quote disappeared after reprice.");
  return toQuoteDTO(updated);
}

export class QuoteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteInputError";
  }
}
