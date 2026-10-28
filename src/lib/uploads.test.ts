import path from "node:path";
import { describe, expect, it } from "vitest";
import { declaredBodyTooLarge } from "./http";
import { inspectUpload, resolveStoredUpload, safeOriginalFilename } from "./uploads";

function binaryStl(triangles = 1): Buffer {
  const bytes = Buffer.alloc(84 + triangles * 50);
  bytes.writeUInt32LE(triangles, 80);
  return bytes;
}

describe("inspectUpload", () => {
  it("keeps a safe display name and drops path segments", () => {
    expect(safeOriginalFilename("../../etc/passwd.stl")).toBe("passwd.stl");
    expect(safeOriginalFilename("folder\\hook.stl")).toBe("hook.stl");
    expect(safeOriginalFilename("a\u0000b.stl")).toBe("ab.stl");
  });

  it("accepts stl and 3mf bytes and rejects everything else", () => {
    const ascii = Buffer.concat([Buffer.from("solid hook\nfacet\nendsolid hook\n"), Buffer.alloc(80)]);
    expect(inspectUpload("hook.stl", ascii).ok).toBe(true);
    expect(inspectUpload("part.STL", binaryStl()).ok).toBe(true);

    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(80)]);
    const threemf = inspectUpload("part.3mf", zip);
    expect(threemf.ok).toBe(true);
    if (threemf.ok) expect(threemf.extension).toBe(".3mf");

    expect(inspectUpload("notes.txt", ascii).ok).toBe(false);
    expect(inspectUpload("evil.stl", Buffer.from("not a mesh".padEnd(80, "!"))).ok).toBe(false);
    expect(inspectUpload("evil.3mf", binaryStl()).ok).toBe(false);
    expect(inspectUpload("x\u0000.stl", ascii).ok).toBe(false);
    expect(inspectUpload("tiny.stl", Buffer.from("solid")).ok).toBe(false);
  });

  it("refuses stored names that leave the upload directory", () => {
    const root = path.join("/tmp", "platequote-uploads");
    expect(resolveStoredUpload(root, "../secret.stl")).toBeNull();
    expect(resolveStoredUpload(root, "..%2fsecret.stl")).toBeNull();
    expect(resolveStoredUpload(root, "model.stl")).toBeNull();
    const stored = "8f1c0c2e-1b4a-4c3d-9a77-0d5e6f708192.stl";
    expect(resolveStoredUpload(root, stored)).toBe(path.join(root, stored));
  });
});

describe("declaredBodyTooLarge", () => {
  it("honors content-length", () => {
    const request = new Request("http://localhost/", { headers: { "content-length": "9000" } });
    expect(declaredBodyTooLarge(request, 4096)).toBe(true);
    expect(declaredBodyTooLarge(new Request("http://localhost/"), 4096)).toBe(false);
  });
});
