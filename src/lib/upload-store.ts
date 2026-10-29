import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { resolveStoredUpload } from "@/lib/uploads";

/** Unpaid uploads are dropped from the database after this long. Paid orders keep theirs. */
export const UNPAID_UPLOAD_TTL_HOURS = 48;

/** Every QuoteFile created before this instant and not attached to a paid order is stale. */
export function staleUploadCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - UNPAID_UPLOAD_TTL_HOURS * 60 * 60 * 1000);
}

/** An order in any of these states has been paid for; its file is never pruned. */
export const PAID_ORDER_STATUSES = ["paid", "printing", "shipped"] as const;

/**
 * Keeps the uploaded bytes in Postgres. Called right after the Quote row exists so a
 * web restart between quote and payment cannot lose the model.
 */
export async function storeUploadBytes(quoteId: string, bytes: Buffer): Promise<void> {
  await prisma.quoteFile.create({ data: { quoteId, bytes: new Uint8Array(bytes), sizeBytes: bytes.length } });
}

/** Deletes stale unpaid files. Returns how many rows went. Runs before every new upload. */
export async function pruneStaleUploads(now: Date = new Date()): Promise<number> {
  const result = await prisma.quoteFile.deleteMany({
    where: {
      createdAt: { lt: staleUploadCutoff(now) },
      quote: {
        OR: [{ order: null }, { order: { status: { notIn: [...PAID_ORDER_STATUSES] } } }],
      },
    },
  });
  return result.count;
}

export type StoredModel = { bytes: Buffer; filename: string; stored: string; source: "database" | "disk" };

/**
 * The model bytes for a quote: Postgres first, the local upload directory as a fallback
 * for rows written before files were stored in the database.
 */
export async function loadModelBytes(quoteId: string, uploadDirectory: string): Promise<StoredModel | null> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { originalFilename: true, storedFilename: true, file: { select: { bytes: true } } },
  });
  if (!quote) return null;
  if (quote.file) {
    return {
      bytes: Buffer.from(quote.file.bytes),
      filename: quote.originalFilename,
      stored: quote.storedFilename,
      source: "database",
    };
  }
  const full = resolveStoredUpload(uploadDirectory, quote.storedFilename);
  if (!full) return null;
  try {
    const bytes = await readFile(full);
    return { bytes, filename: quote.originalFilename, stored: quote.storedFilename, source: "disk" };
  } catch {
    return null;
  }
}
