import type { AiReviewDTO, MeshFactsDTO, ReviewWarning } from "@/lib/types";

type Purpose = "general" | "looks" | "outdoor" | "heat" | "flex";

const FITS: Record<string, Record<Purpose, "good" | "ok" | "poor">> = {
  PLA: { general: "good", looks: "good", outdoor: "poor", heat: "poor", flex: "poor" },
  PETG: { general: "good", looks: "ok", outdoor: "ok", heat: "ok", flex: "poor" },
  ASA: { general: "ok", looks: "ok", outdoor: "good", heat: "good", flex: "poor" },
  TPU: { general: "poor", looks: "poor", outdoor: "ok", heat: "poor", flex: "good" },
};

const REASONS: Record<string, Record<Purpose, string>> = {
  PLA: {
    general: "PLA is the straightforward choice for an indoor part that does not get hot.",
    looks: "PLA holds detail and color well, which suits a part that is mostly for looks.",
    outdoor: "PLA warps and fades in sun and weather. It is a poor match for outdoor use.",
    heat: "PLA softens in a warm car or near a heat source. Pick something that holds its shape.",
    flex: "PLA is stiff. It will snap instead of bending.",
  },
  PETG: {
    general: "PETG is a sturdy everyday filament and a little tougher than PLA.",
    looks: "PETG is tougher than PLA, with a slightly softer look on fine edges.",
    outdoor: "PETG handles moisture better than PLA. Long sun exposure still favors ASA.",
    heat: "PETG stays rigid further up the temperature range than PLA.",
    flex: "PETG has some give, but it is not a flexible material.",
  },
  ASA: {
    general: "ASA is durable, and it is more than this part needs if it stays indoors.",
    looks: "ASA prints a solid outdoor-ready surface. PLA is usually prettier for display pieces.",
    outdoor: "ASA stands up to sunlight better than PLA or PETG.",
    heat: "ASA keeps its shape when the part lives near heat.",
    flex: "ASA is rigid. It is the wrong family if the part must bend.",
  },
  TPU: {
    general: "TPU is a rubbery filament. Use it only when the part should flex.",
    looks: "TPU is a poor match for a crisp display part.",
    outdoor: "TPU survives weather, but only if the part is supposed to be soft.",
    heat: "TPU is not the material to choose for a hot, rigid part.",
    flex: "TPU is the shop's flexible option. It bends instead of snapping.",
  },
};

export type MockReviewInput = {
  purpose: string;
  selectedMaterial: string;
  bed: { x: number; y: number; z: number };
  mesh: MeshFactsDTO | null;
  slicer: { supports: boolean; profileName: string } | null;
  shopMaterialNames: string[];
  mockReason: string | null;
};

function purposeOf(value: string): Purpose {
  if (value === "looks" || value === "outdoor" || value === "heat" || value === "flex") return value;
  return "general";
}

export function mockReview(input: MockReviewInput): AiReviewDTO {
  const purpose = purposeOf(input.purpose);
  const warnings: ReviewWarning[] = [];
  const mesh = input.mesh;

  if (!mesh) {
    warnings.push({
      severity: "blocker",
      title: "The mesh could not be read",
      detail: "There are no dimensions to check against the printer.",
      fix: "Export a closed STL or 3MF from the modeling tool and upload that file.",
    });
  } else {
    const box = mesh.boundingBoxMm;
    if (!mesh.fitsBed) {
      warnings.push({
        severity: "blocker",
        title: "It does not fit the bed",
        detail: `The part is ${box.x.toFixed(0)} × ${box.y.toFixed(0)} × ${box.z.toFixed(0)} mm. This printer's bed is ${input.bed.x.toFixed(0)} × ${input.bed.y.toFixed(0)} × ${input.bed.z.toFixed(0)} mm.`,
        fix: mesh.fitsIfRotated
          ? "Turn the part 90° on the bed so the long side follows the other axis, then quote it again."
          : "Scale the part down, or split it into pieces that fit the bed.",
      });
    }
    if (!mesh.watertight) {
      warnings.push({
        severity: "warning",
        title: "The mesh is not watertight",
        detail: "Holes or inside-out surfaces make the slicer's volume less trustworthy.",
        fix: "Repair the mesh in your modeling tool, then upload the repaired file.",
      });
    }
    if (mesh.thinWall) {
      const thickness =
        mesh.characteristicThicknessMm != null
          ? ` Characteristic thickness is about ${mesh.characteristicThicknessMm.toFixed(2)} mm.`
          : "";
      warnings.push({
        severity: "warning",
        title: "A wall looks thin for a 0.4 mm nozzle",
        detail: `Walls under about 0.8 mm may vanish or print as a single shaky strand.${thickness}`,
        fix: "Thicken the thin sections, or ask the shop about a smaller nozzle.",
      });
    }
    if (mesh.overhangFaceShare >= 0.02) {
      warnings.push({
        severity: "warning",
        title: "Some faces will want support",
        detail: `About ${(mesh.overhangFaceShare * 100).toFixed(1)}% of the surface hangs past 45° from horizontal, not counting the face on the bed.`,
        fix: "Rotate the part so those faces point up or sit against the bed. That often drops the support plastic.",
      });
    }
    if (mesh.partCount > 1) {
      warnings.push({
        severity: "info",
        title: "The file has more than one shell",
        detail: `${mesh.partCount} separate pieces were found. They are priced as one job.`,
        fix: "Upload the pieces separately if they should be different materials or quantities.",
      });
    }
  }

  if (input.slicer?.supports) {
    warnings.push({
      severity: "info",
      title: "The slicer generated supports",
      detail: `Support plastic is included in the filament weight from the ${input.slicer.profileName} profile.`,
      fix: "If you can rotate the part onto a flat face, quote it again. The weight should fall if the supports go away.",
    });
  }

  const names = input.shopMaterialNames.length
    ? input.shopMaterialNames
    : Object.keys(FITS);
  const materialAdvice = names
    .map((name) => {
      const key = name.toUpperCase();
      const table = FITS[key];
      const reasons = REASONS[key];
      if (!table || !reasons) return null;
      return { material: key, fit: table[purpose], reason: reasons[purpose] };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => rank(a.fit) - rank(b.fit));

  const printable = !warnings.some((warning) => warning.severity === "blocker");
  const selected = input.selectedMaterial.toUpperCase();
  const summary = !mesh
    ? "This file could not be checked, so there is no estimate."
    : !printable
      ? "This upload should not be priced as a printable job until the fit or the file is fixed."
      : input.slicer
        ? `Sliced with a generic profile. ${selected || "The chosen material"} is what this quote is priced in. The notes below are about the print, not the price.`
        : "The mesh was checked. There is no slicer result, so there is no price.";

  const orientationNote = !mesh
    ? "Upload a mesh before worrying about orientation."
    : !mesh.fitsBed && mesh.fitsIfRotated
      ? "A quarter turn on the bed should bring it inside the printable area. Quote the rotated file so the grams are real."
      : mesh.overhangFaceShare >= 0.02
        ? "Try laying the largest flat face on the bed. Overhangs facing the bed are what create support."
        : "The uploaded orientation is a reasonable place to start.";

  return {
    provider: "mock",
    mocked: true,
    mockReason: input.mockReason,
    summary,
    printable,
    warnings,
    orientationNote,
    materialAdvice,
  };
}

function rank(fit: "good" | "ok" | "poor"): number {
  if (fit === "good") return 0;
  if (fit === "ok") return 1;
  return 2;
}
