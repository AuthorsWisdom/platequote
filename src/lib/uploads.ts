import path from "node:path";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(stl|3mf)$/i;

export function safeOriginalFilename(filename: string): string {
  const normalized = filename.replaceAll("\\", "/").replace(/[\u0000-\u001f]/g, "");
  const base = path.basename(normalized).trim();
  const cleaned = base.replace(/[^A-Za-z0-9._ ()-]/g, "_").replace(/^\.+/, "").slice(0, 180);
  return cleaned || "model";
}

export function resolveStoredUpload(directory: string, storedFilename: string): string | null {
  if (!STORED_NAME.test(storedFilename)) return null;
  const root = path.resolve(directory);
  const full = path.resolve(root, storedFilename);
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}

function looksLikeStl(bytes: Buffer): boolean {
  const head = bytes.subarray(0, Math.min(bytes.length, 80)).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("solid")) return true;
  if (bytes.length < 84) return false;
  const count = bytes.readUInt32LE(80);
  if (!Number.isInteger(count) || count < 1 || count > 5_000_000) return false;
  const expected = 84 + count * 50;
  return bytes.length >= expected && bytes.length <= expected + 4096;
}

function looksLike3mf(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function inspectUpload(
  filename: string,
  bytes: Buffer,
): { ok: true; filename: string; extension: ".stl" | ".3mf" } | { ok: false; message: string } {
  if (filename.includes("\0")) return { ok: false, message: "The file name is not valid." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, message: "That file is over the 25 MB upload cap." };
  if (bytes.length < 80) return { ok: false, message: "The file is too small to be a mesh." };
  const display = safeOriginalFilename(filename);
  const lower = display.toLowerCase();
  const extension = lower.endsWith(".3mf") ? ".3mf" : lower.endsWith(".stl") ? ".stl" : null;
  if (!extension) return { ok: false, message: "Upload an .stl or .3mf file." };
  if (extension === ".3mf" && !looksLike3mf(bytes)) {
    return { ok: false, message: "That file does not look like a 3MF archive." };
  }
  if (extension === ".stl" && !looksLikeStl(bytes)) {
    return { ok: false, message: "That file does not look like an STL mesh." };
  }
  return { ok: true, filename: display, extension };
}
