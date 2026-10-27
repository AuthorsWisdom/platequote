#!/usr/bin/env python3
"""Write the small ASCII STL samples used by the quote demo.

The meshes are closed shells (a box, an L-bracket, and a hook with a
horizontal lip). Run from the repo root: python3 scripts/generate-samples.py
"""

from __future__ import annotations

from pathlib import Path


def signed_volume(tris: list[tuple[tuple[float, float, float], ...]]) -> float:
    volume = 0.0
    for a, b, c in tris:
        volume += (
            a[0] * (b[1] * c[2] - b[2] * c[1])
            + a[1] * (b[2] * c[0] - b[0] * c[2])
            + a[2] * (b[0] * c[1] - b[1] * c[0])
        )
    return volume / 6.0


def flip(tris):
    return [(a, c, b) for a, b, c in tris]


def _cross(a, b, c) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _point_in_triangle(point, a, b, c) -> bool:
    c1 = _cross(a, b, point)
    c2 = _cross(b, c, point)
    c3 = _cross(c, a, point)
    has_neg = c1 < -1e-9 or c2 < -1e-9 or c3 < -1e-9
    has_pos = c1 > 1e-9 or c2 > 1e-9 or c3 > 1e-9
    return not (has_neg and has_pos)


def triangulate(poly: list[tuple[float, float]]) -> list[tuple[int, int, int]]:
    """Ear-clip a simple CCW polygon, including concave brackets."""
    indices = list(range(len(poly)))
    triangles: list[tuple[int, int, int]] = []
    guard = 0
    while len(indices) > 3:
        guard += 1
        if guard > 1000:
            raise RuntimeError("Could not triangulate the profile")
        ear = None
        for position, current in enumerate(indices):
            previous = indices[position - 1]
            nxt = indices[(position + 1) % len(indices)]
            a, b, c = poly[previous], poly[current], poly[nxt]
            if _cross(a, b, c) <= 1e-9:
                continue
            if any(
                _point_in_triangle(poly[other], a, b, c)
                for other in indices
                if other not in (previous, current, nxt)
            ):
                continue
            ear = (position, previous, current, nxt)
            break
        if ear is None:
            raise RuntimeError("Could not triangulate the profile")
        position, previous, current, nxt = ear
        triangles.append((previous, current, nxt))
        del indices[position]
    triangles.append((indices[0], indices[1], indices[2]))
    return triangles


def extrude(poly: list[tuple[float, float]], y0: float, y1: float):
    """Extrude a CCW polygon in the XZ plane along +Y into a closed shell."""
    count = len(poly)
    verts = [(x, y0, z) for x, z in poly] + [(x, y1, z) for x, z in poly]
    tris = []
    for i0, i1, i2 in triangulate(poly):
        tris.append((verts[count + i0], verts[count + i1], verts[count + i2]))
        tris.append((verts[i0], verts[i2], verts[i1]))
    for index in range(count):
        nxt = (index + 1) % count
        a = verts[index]
        b = verts[nxt]
        c = verts[count + nxt]
        d = verts[count + index]
        tris.append((a, b, c))
        tris.append((a, c, d))
    if signed_volume(tris) < 0:
        tris = flip(tris)
    return tris


def box(size: float):
    return extrude([(0, 0), (size, 0), (size, size), (0, size)], 0, size)


def write_stl(path: Path, name: str, tris) -> None:
    lines = [f"solid {name}"]
    for a, b, c in tris:
        lines.append("  facet normal 0 0 0")
        lines.append("    outer loop")
        for point in (a, b, c):
            lines.append(f"      vertex {point[0]:.4f} {point[1]:.4f} {point[2]:.4f}")
        lines.append("    endloop")
        lines.append("  endfacet")
    lines.append(f"endsolid {name}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    volume = signed_volume(tris)
    print(f"{path.name}: {len(tris)} triangles, volume {volume:.1f} mm^3")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    targets = [root / "samples", root / "public" / "samples"]
    for directory in targets:
        directory.mkdir(parents=True, exist_ok=True)

    models = {
        "calibration-cube.stl": ("calibration_cube", box(20)),
        "angle-bracket.stl": (
            "angle_bracket",
            extrude([(0, 0), (50, 0), (50, 4), (4, 4), (4, 30), (0, 30)], 0, 40),
        ),
        "overhang-hook.stl": (
            "overhang_hook",
            extrude(
                [(0, 0), (40, 0), (40, 4), (8, 4), (8, 24), (28, 24), (28, 28), (0, 28)],
                0,
                24,
            ),
        ),
    }
    for directory in targets:
        for filename, (name, tris) in models.items():
            write_stl(directory / filename, name, tris)


if __name__ == "__main__":
    main()
