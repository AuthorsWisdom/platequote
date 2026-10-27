"""Run PrusaSlicer as a separate process and return quote facts.

The slicer binary is AGPL-3.0. It is executed with subprocess and is not
linked into this process.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from gcode_parse import GcodeParseError, parse_gcode
from mesh_analysis import analyze_mesh


TEMPS = {
    "pla": (210, 60),
    "petg": (240, 80),
    "asa": (250, 100),
    "tpu": (230, 50),
}

PROFILE_NAME = "generic-0.20mm-15pct-0.4nozzle"


class SliceError(RuntimeError):
    def __init__(self, code: str, message: str, mesh: dict | None = None):
        super().__init__(message)
        self.code = code
        self.mesh = mesh


def slicer_bin() -> str:
    return os.environ.get("PRUSA_SLICER_BIN", "prusa-slicer")


def engine_version() -> str:
    try:
        completed = subprocess.run(
            [slicer_bin(), "--help"],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
            env=_env(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return "unknown"
    first = (completed.stdout or completed.stderr or "").splitlines()
    return first[0].strip() if first else "unknown"


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("QT_QPA_PLATFORM", "offscreen")
    env.setdefault("HOME", "/tmp")
    return env


def slice_file(
    source: Path,
    *,
    material: str,
    density: float,
    bed_x: float,
    bed_y: float,
    bed_z: float,
) -> dict:
    try:
        mesh = analyze_mesh(str(source), bed_x, bed_y, bed_z)
    except Exception as exc:  # trimesh raises a wide set of parse errors
        raise SliceError("mesh_unreadable", f"Could not read the mesh: {exc}") from exc

    if not mesh["fitsBed"]:
        if mesh["fitsIfRotated"]:
            message = (
                "The part does not fit this printer's bed in the uploaded orientation. "
                "It does fit if it is turned 90° on the bed. Rotate the file and quote it again."
            )
        else:
            message = "The part is larger than this printer's bed, including its height."
        raise SliceError("does_not_fit_bed", message, mesh)

    nozzle_temp, bed_temp = TEMPS.get(material.lower(), TEMPS["pla"])
    with tempfile.TemporaryDirectory(prefix="platequote-") as directory:
        gcode_path = str(Path(directory) / "out.gcode")
        command = [
            slicer_bin(),
            "--export-gcode",
            "--output",
            gcode_path,
            "--layer-height",
            "0.2",
            "--first-layer-height",
            "0.2",
            "--fill-density",
            "15%",
            "--perimeters",
            "2",
            "--top-solid-layers",
            "4",
            "--bottom-solid-layers",
            "3",
            "--support-material",
            "--support-material-auto",
            "--support-material-threshold",
            "45",
            "--filament-diameter",
            "1.75",
            "--filament-density",
            f"{density:.4f}",
            "--nozzle-diameter",
            "0.4",
            "--temperature",
            str(nozzle_temp),
            "--bed-temperature",
            str(bed_temp),
            "--bed-shape",
            f"0x0,{bed_x:g}x0,{bed_x:g}x{bed_y:g},0x{bed_y:g}",
            "--center",
            f"{bed_x / 2:g},{bed_y / 2:g}",
            "--gcode-comments",
            "--skirts",
            "1",
            str(source),
        ]
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=120,
                env=_env(),
            )
        except subprocess.TimeoutExpired as exc:
            raise SliceError("slice_timeout", "Slicing took longer than 2 minutes.", mesh) from exc
        except OSError as exc:
            raise SliceError("slicer_missing", f"Could not start the slicer: {exc}", mesh) from exc

        if completed.returncode != 0 or not Path(gcode_path).is_file():
            detail = (completed.stderr or completed.stdout or "PrusaSlicer failed").strip()
            raise SliceError("slice_failed", detail[-2000:], mesh)

        gcode = Path(gcode_path).read_text(encoding="utf-8", errors="replace")

    try:
        parsed = parse_gcode(gcode)
    except GcodeParseError as exc:
        raise SliceError("gcode_unreadable", str(exc), mesh) from exc

    if parsed["filamentCm3"] is None:
        raise SliceError("gcode_unreadable", "G-code is missing filament used [cm3].", mesh)

    return {
        "ok": True,
        "engine": "prusaslicer",
        "engineVersion": engine_version(),
        "profileName": PROFILE_NAME,
        "filamentGrams": round(parsed["filamentGrams"], 4),
        "filamentCm3": round(parsed["filamentCm3"], 4),
        "printTimeSeconds": int(parsed["printTimeSeconds"]),
        "supports": bool(parsed["supports"]),
        "boundingBoxMm": mesh["boundingBoxMm"],
        "filamentDensityGPerCm3": density,
        "mesh": mesh,
    }
