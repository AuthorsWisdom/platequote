import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { attachEnginePrices } from "@/lib/ai/price-advice";
import { toPublicReason } from "@/lib/ai/reasons";
import { reviewPrint } from "@/lib/ai/review";
import { prisma } from "@/lib/db";
import { quoteDeadline, slicerTimeoutMs } from "@/lib/quote-budget";
import { gramsForMaterial, priceQuote, type PriceBreakdown } from "@/lib/pricing";
import { toPublicOrder } from "@/lib/public-order";
import { meshFactsSchema, parseSlicerResult, type SlicerResponse } from "@/lib/slicer-result";
import { getShopRecord, toMaterialDTO, toPrinterDTO } from "@/lib/shop";
import type { MeshFactsDTO, OrderStatus, PriceBreakdownDTO, QuoteDTO, StoredReview } from "@/lib/types";
import { loadModelBytes, pruneStaleUploads, storeUploadBytes } from "@/lib/upload-store";
import { inspectUpload } from "@/lib/uploads";
import { workerHeaders, workerMisconfigured, workerToken } from "@/lib/worker-auth";

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
  const stored = record as StoredReview;
  // Older builds saved raw error text here; only fixed public codes reach the page.
  return { ...stored, review: { ...stored.review, mockReason: toPublicReason(stored.review.mockReason) } };
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
  return loadModelBytes(id, uploadDirectory());
}

type SliceInput = {
  bytes: Buffer;
  extension: ".stl" | ".3mf";
  materialSlug: string;
  density: number;
  bedXmm: number;
  bedYmm: number;
  bedZmm: number;
  timeoutMs: number | null;
};

/** Clock and pause the wake path uses; tests swap in a fake clock. */
export type SliceDeps = { now: () => number; sleep: (ms: number) => Promise<void> };

const realSliceDeps: SliceDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** After waiting for a sleeping worker, at least this much of the slice budget is kept for the slice itself. */
export const WAKE_SLICE_RESERVE_MS = 15_000;
const WAKE_POLL_INTERVAL_MS = 2_000;
const WAKE_PROBE_TIMEOUT_MS = 10_000;
const WAKE_MAX_PROBES = 100;

const timedOut: SlicerResponse = {
  ok: false,
  error: "worker_timeout",
  message: "Slicing took longer than this quote can wait. Try a smaller or simpler file.",
  mesh: null,
};

const sliceWaking: SlicerResponse = {
  ok: false,
  error: "worker_waking",
  message: "The slicer was waking up. Try again in a moment.",
  mesh: null,
};

const sliceUnauthorized: SlicerResponse = {
  ok: false,
  error: "worker_unauthorized",
  message: "The slicing worker refused the shared token. Check SLICER_WORKER_TOKEN on both services.",
  mesh: null,
};

const sliceUnreachable: SlicerResponse = {
  ok: false,
  error: "worker_unreachable",
  message: "The slicing worker is not reachable. Start it with docker compose and try again.",
  mesh: null,
};

const sliceNotJson: SlicerResponse = {
  ok: false,
  error: "worker_bad_response",
  message: "The slicing worker returned something that was not JSON.",
  mesh: null,
};

const sliceRedirected: SlicerResponse = {
  ok: false,
  error: "worker_bad_response",
  message: "The slicing worker answered with a redirect, which this host refuses. Check SLICER_WORKER_URL.",
  mesh: null,
};

/** "asleep" means the request never reached the worker app: wait for /health, then try once more. */
type SliceAttempt = { asleep: boolean; result: SlicerResponse };

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function causeCode(error: unknown): string {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  return typeof cause?.code === "string" ? cause.code : "";
}

/** An abort or a transport timeout, in either the connect or the body phase: slow, not asleep. */
function isTimeout(error: unknown): boolean {
  return isAbort(error) || TIMEOUT_CODES.has(causeCode(error));
}

/** fetch is told not to follow redirects (a 307/308 would replay the POST and its token elsewhere). */
function isRedirect(response: Response): boolean {
  return response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400);
}

/** Transport timeouts from Node fetch: a slow worker, not a sleeping one, so never retried. */
const TIMEOUT_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ETIMEDOUT"]);
const LOGGED_CODES = new Set([
  ...TIMEOUT_CODES,
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
]);
const LOGGED_ERROR_NAMES = new Set(["TypeError", "Error", "SocketError", "ConnectTimeoutError"]);
const LOGGED_MEDIA_TYPES = new Set(["text/html", "text/plain", "application/json", "application/problem+json"]);

/**
 * Upstream text never reaches a log line (an echoed token could hide in any encoding), so the
 * outage is named by fixed vocabularies only: anything outside the list logs as "other".
 */
function logField(value: string | null | undefined, allowed: Set<string>): string {
  const bare = (value ?? "").split(";")[0].trim().toLowerCase();
  if (!bare) return "none";
  for (const item of allowed) if (item.toLowerCase() === bare) return item;
  return "other";
}

function sliceForm(input: SliceInput): FormData {
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(input.bytes)]), `model${input.extension}`);
  body.append("material", input.materialSlug);
  body.append("density", String(input.density));
  body.append("bed_x", String(input.bedXmm));
  body.append("bed_y", String(input.bedYmm));
  body.append("bed_z", String(input.bedZmm));
  return body;
}

/** One POST /slice that cannot run past `until` (epoch ms). */
async function postSlice(input: SliceInput, until: number, deps: SliceDeps): Promise<SliceAttempt> {
  const body = sliceForm(input);
  const timeoutMs = Math.floor(until - deps.now());
  if (timeoutMs < 1) return { asleep: false, result: timedOut };
  let response: Response;
  try {
    response = await fetch(`${workerBaseUrl()}/slice`, {
      method: "POST",
      headers: workerHeaders(),
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeout(error)) return { asleep: false, result: timedOut };
    const code = causeCode(error);
    console.warn(
      `[slicer] POST /slice could not connect: ` +
        `${logField(error instanceof Error ? error.name : "", LOGGED_ERROR_NAMES)} ${logField(code, LOGGED_CODES)}`,
    );
    return { asleep: true, result: sliceUnreachable };
  }
  // The worker's own token refusal. A 503 is only the worker's when it carries JSON (checked below).
  if (response.status === 401) return { asleep: false, result: sliceUnauthorized };
  if (isRedirect(response)) {
    console.warn(`[slicer] POST /slice status ${response.status}: redirect refused, not retried`);
    return { asleep: false, result: sliceRedirected };
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (isTimeout(error)) return { asleep: false, result: timedOut };
    // Headers came back, so a 2xx reply means the worker took the job: never resubmit it.
    const answered = response.status >= 200 && response.status < 300;
    console.warn(`[slicer] POST /slice status ${response.status}: body could not be read`);
    return { asleep: !answered, result: sliceNotJson };
  }
  let json: unknown;
  let isJson = true;
  try {
    json = JSON.parse(text);
  } catch {
    isJson = false;
  }
  if (!isJson || response.status === 502 || response.status === 504) {
    // Render answers for a sleeping free worker fast, without reaching the app, with a body like this.
    console.warn(
      `[slicer] POST /slice status ${response.status}, unexpected reply: ` +
        `content-type ${logField(response.headers.get("content-type"), LOGGED_MEDIA_TYPES)}, ${text.length} chars, ` +
        `${isJson ? "JSON" : "not JSON"}`,
    );
    return { asleep: true, result: isJson ? sliceUnreachable : sliceNotJson };
  }
  if (response.status === 503) return { asleep: false, result: sliceUnauthorized };
  try {
    return { asleep: false, result: parseSlicerResult(json) };
  } catch {
    return {
      asleep: false,
      result: {
        ok: false,
        error: "worker_bad_response",
        message: "The slicing worker returned JSON that does not match the quote contract.",
        mesh: null,
      },
    };
  }
}

/** Polls GET /health until it answers 200 JSON or `waitUntil` (epoch ms) passes. */
async function waitForWorker(waitUntil: number, deps: SliceDeps): Promise<boolean> {
  for (let probe = 0; probe < WAKE_MAX_PROBES; probe += 1) {
    const left = waitUntil - deps.now();
    if (left <= 0) return false;
    try {
      const health = await fetch(`${workerBaseUrl()}/health`, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1, Math.min(WAKE_PROBE_TIMEOUT_MS, left))),
      });
      if (health.status === 200) {
        const body: unknown = await health.json();
        // The worker's own /health answers {"ok": true, ...}; anything else is not the worker yet.
        if (body && typeof body === "object" && (body as { ok?: unknown }).ok === true) return true;
      }
    } catch {
      // Still waking: connection refused, timeout, or a non-JSON placeholder page.
    }
    const pause = Math.min(WAKE_POLL_INTERVAL_MS, waitUntil - deps.now());
    if (pause <= 0) return false;
    await deps.sleep(pause);
  }
  return false;
}

export async function sliceUpload(input: SliceInput, deps: SliceDeps = realSliceDeps): Promise<SlicerResponse> {
  // Not enough of the route budget left to slice and still save: skip the worker.
  if (input.timeoutMs === null) return timedOut;
  if (workerMisconfigured()) {
    return {
      ok: false,
      error: "worker_unauthorized",
      message: "The slicing worker secret is not configured on this host.",
      mesh: null,
    };
  }
  // Every attempt and every wait ends by this instant, so the route keeps its save reserve.
  const sliceBy = deps.now() + input.timeoutMs;
  const first = await postSlice(input, sliceBy, deps);
  if (!first.asleep) return first.result;
  // The worker looked asleep. Wait for it inside the budget, then retry exactly once.
  const awake = await waitForWorker(sliceBy - WAKE_SLICE_RESERVE_MS, deps);
  const left = sliceBy - deps.now();
  if (!awake || left < 1_000) {
    console.warn(`[slicer] worker did not wake inside the quote budget (${input.timeoutMs} ms)`);
    return sliceWaking;
  }
  const second = await postSlice(input, sliceBy, deps);
  return second.result;
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
  /** Epoch ms by which the quote must be saved. Defaults to the route budget from now. */
  deadline?: number;
}): Promise<QuoteDTO> {
  const deadline = input.deadline ?? quoteDeadline(Date.now());
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
  // Disk is a local cache only: the free web service's disk is wiped on every restart.
  await mkdir(uploadDirectory(), { recursive: true });
  await writeFile(path.join(uploadDirectory(), storedFilename), input.bytes);
  await pruneStaleUploads().catch(() => 0);

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
  await storeUploadBytes(created.id, input.bytes);

  const sliced = await sliceUpload({
    bytes: input.bytes,
    extension,
    materialSlug: material.slug,
    density: material.densityGPerCm3,
    bedXmm: printer.bedXmm,
    bedYmm: printer.bedYmm,
    bedZmm: printer.bedZmm,
    timeoutMs: slicerTimeoutMs(deadline),
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
  }, { deadline });

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
