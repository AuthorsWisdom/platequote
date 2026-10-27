export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const PURPOSES = [
  { id: "general", label: "Everyday part" },
  { id: "looks", label: "Looks and color" },
  { id: "outdoor", label: "Outdoor or sunlight" },
  { id: "heat", label: "Heat nearby" },
  { id: "flex", label: "Needs to flex" },
] as const;

export type PurposeId = (typeof PURPOSES)[number]["id"];

export const COLOR_HEX: Record<string, string> = {
  Black: "#1c1c1c",
  White: "#f4f1ea",
  Gray: "#8d8880",
  Red: "#b4332a",
  Blue: "#2c4f86",
  Orange: "#d4652f",
  Natural: "#e4d3b0",
};

export function colorHex(name: string): string {
  return COLOR_HEX[name] ?? "#c4511a";
}

export const SAMPLES = [
  { file: "calibration-cube.stl", label: "Calibration cube" },
  { file: "angle-bracket.stl", label: "Angle bracket" },
  { file: "overhang-hook.stl", label: "Overhang hook" },
] as const;
