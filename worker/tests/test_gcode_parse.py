import pytest

from gcode_parse import GcodeParseError, parse_duration, parse_gcode


CUBE_FOOTER = """
;TYPE:Perimeter
;TYPE:External perimeter
;TYPE:Internal infill
; filament used [mm] = 1190.25
; filament used [cm3] = 2.86
; filament used [g] = 3.55
; total filament used [g] = 3.55
; total filament cost = 0.00
; estimated printing time (normal mode) = 17m 4s
; estimated first layer printing time (normal mode) = 46s
"""

SUPPORT_JOB = """
;TYPE:Support material
;TYPE:Support material interface
; filament used [g] = 1.20, 0.30
; filament used [cm3] = 0.97, 0.24
; total filament used [g] = 1.50
; estimated printing time (normal mode) = 1h 2m 3s
"""


def test_cube_footer_matches_prusaslicer_summary():
    parsed = parse_gcode(CUBE_FOOTER)
    assert parsed["filamentGrams"] == 3.55
    assert parsed["filamentCm3"] == 2.86
    assert parsed["printTimeSeconds"] == 17 * 60 + 4
    assert parsed["supports"] is False


def test_support_extrusion_and_multi_tool_grams():
    parsed = parse_gcode(SUPPORT_JOB)
    assert parsed["supports"] is True
    assert parsed["filamentGrams"] == 1.5
    assert parsed["filamentCm3"] == pytest.approx(1.21)
    assert parsed["printTimeSeconds"] == 3600 + 120 + 3


def test_duration_units():
    assert parse_duration("45s") == 45
    assert parse_duration("2d 1h 0m 1s") == 2 * 86400 + 3600 + 1


def test_silent_mode_is_a_fallback():
    text = "\n".join(
        [
            "; filament used [g] = 1",
            "; filament used [cm3] = 0.8",
            "; estimated printing time (silent mode) = 10m",
        ]
    )
    assert parse_gcode(text)["printTimeSeconds"] == 600


def test_normal_mode_wins_over_silent():
    text = "\n".join(
        [
            "; filament used [g] = 1",
            "; filament used [cm3] = 0.8",
            "; estimated printing time (silent mode) = 10m",
            "; estimated printing time (normal mode) = 12m 1s",
        ]
    )
    assert parse_gcode(text)["printTimeSeconds"] == 721


def test_missing_grams_raises():
    with pytest.raises(GcodeParseError):
        parse_gcode("; estimated printing time (normal mode) = 1m\n")


def test_missing_time_raises():
    with pytest.raises(GcodeParseError):
        parse_gcode("; filament used [g] = 1.0\n")
