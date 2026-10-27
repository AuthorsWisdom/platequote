"""Parse the summary comments PrusaSlicer writes at the end of a G-code file.

The slicer runs as a separate process. This module only reads its text output.
"""

from __future__ import annotations

import re


class GcodeParseError(ValueError):
    pass


_GRAMS = re.compile(r"^;\s*filament used \[g\]\s*=\s*(.+)$", re.MULTILINE)
_TOTAL_GRAMS = re.compile(r"^;\s*total filament used \[g\]\s*=\s*(.+)$", re.MULTILINE)
_CM3 = re.compile(r"^;\s*filament used \[cm3\]\s*=\s*(.+)$", re.MULTILINE)
_TIME = re.compile(
    r"^;\s*estimated printing time \((normal|silent) mode\)\s*=\s*(.+)$",
    re.MULTILINE,
)
_SUPPORT = re.compile(r"^;TYPE:\s*Support\b", re.MULTILINE | re.IGNORECASE)
_DURATION_PART = re.compile(r"(\d+)\s*([dhms])", re.IGNORECASE)


def _sum_numbers(raw: str) -> float:
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if not parts:
        raise GcodeParseError("filament summary was empty")
    try:
        return sum(float(part) for part in parts)
    except ValueError as exc:
        raise GcodeParseError(f"could not read filament amount from {raw!r}") from exc


def parse_duration(text: str) -> int:
    """Turn '1h 2m 3s' into seconds. Units may be omitted."""
    found = {unit.lower(): int(value) for value, unit in _DURATION_PART.findall(text)}
    if not found:
        raise GcodeParseError(f"could not read a print time from {text!r}")
    return (
        found.get("d", 0) * 86400
        + found.get("h", 0) * 3600
        + found.get("m", 0) * 60
        + found.get("s", 0)
    )


def parse_gcode(text: str) -> dict:
    total = _TOTAL_GRAMS.search(text)
    grams_match = total or _GRAMS.search(text)
    if grams_match is None:
        raise GcodeParseError("G-code is missing filament used [g]")
    grams = _sum_numbers(grams_match.group(1))

    cm3_match = _CM3.search(text)
    cm3 = _sum_numbers(cm3_match.group(1)) if cm3_match else None

    times = {mode: value.strip() for mode, value in _TIME.findall(text)}
    time_text = times.get("normal") or times.get("silent")
    if time_text is None:
        raise GcodeParseError("G-code is missing estimated printing time")

    return {
        "filamentGrams": grams,
        "filamentCm3": cm3,
        "printTimeSeconds": parse_duration(time_text),
        "supports": _SUPPORT.search(text) is not None,
    }
