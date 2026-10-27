"""Mesh facts used by the quote page and the printability review.

Bounding box, watertightness, overhang share, and a thin-wall flag. None of
these numbers are a price.
"""

from __future__ import annotations

import math

import numpy as np
import trimesh


OVERHANG_DEG = 45.0
THIN_WALL_MM = 0.8
BED_CONTACT_MM = 0.4


def _as_mesh(loaded) -> tuple[trimesh.Trimesh, int]:
    if isinstance(loaded, trimesh.Scene):
        meshes = [
            geom for geom in loaded.geometry.values() if isinstance(geom, trimesh.Trimesh)
        ]
        if not meshes:
            raise ValueError("The file did not contain a triangle mesh.")
        mesh = trimesh.util.concatenate(meshes)
        return mesh, len(meshes)
    if isinstance(loaded, trimesh.Trimesh):
        return loaded, 1
    raise ValueError("The file did not contain a triangle mesh.")


def analyze_mesh(path: str, bed_x: float, bed_y: float, bed_z: float) -> dict:
    loaded = trimesh.load(path, force=None)
    mesh, scene_parts = _as_mesh(loaded)
    if len(mesh.faces) == 0:
        raise ValueError("The mesh has no triangles.")
    mesh.merge_vertices()
    components = mesh.split(only_watertight=False)
    part_count = max(len(components), scene_parts)

    extents = np.asarray(mesh.extents, dtype=float)
    bounds = np.asarray(mesh.bounds, dtype=float)
    watertight = bool(mesh.is_watertight)
    area_mm2 = float(mesh.area)
    volume_mm3 = float(mesh.volume) if watertight else None
    thickness = None
    if watertight and volume_mm3 is not None and area_mm2 > 0:
        thickness = 2.0 * abs(volume_mm3) / area_mm2

    normals = np.asarray(mesh.face_normals, dtype=float)
    areas = np.asarray(mesh.area_faces, dtype=float)
    centers = np.asarray(mesh.triangles_center, dtype=float)
    nz = normals[:, 2]
    downward = nz < -1e-8
    angle = np.degrees(np.arccos(np.clip(-nz, 0.0, 1.0)))
    min_z = float(bounds[0, 2])
    on_bed = centers[:, 2] <= min_z + BED_CONTACT_MM
    overhang = downward & (angle <= OVERHANG_DEG) & ~on_bed
    total_area = float(areas.sum())
    share = float(areas[overhang].sum() / total_area) if total_area > 0 else 0.0
    if math.isnan(share):
        share = 0.0

    bbox = {
        "x": round(float(extents[0]), 3),
        "y": round(float(extents[1]), 3),
        "z": round(float(extents[2]), 3),
    }
    slack = 0.05
    fits_bed = bbox["x"] <= bed_x + slack and bbox["y"] <= bed_y + slack and bbox["z"] <= bed_z + slack
    fits_rotated = bbox["z"] <= bed_z + slack and (
        (bbox["x"] <= bed_y + slack and bbox["y"] <= bed_x + slack)
        or fits_bed
    )
    thin = (thickness is not None and thickness < THIN_WALL_MM) or min(bbox.values()) < THIN_WALL_MM

    return {
        "watertight": watertight,
        "volumeCm3": None if volume_mm3 is None else round(abs(volume_mm3) / 1000.0, 4),
        "surfaceAreaCm2": round(area_mm2 / 100.0, 4),
        "overhangFaceShare": round(share, 4),
        "overhangThresholdDeg": OVERHANG_DEG,
        "thinWall": bool(thin),
        "characteristicThicknessMm": None if thickness is None else round(thickness, 3),
        "fitsBed": bool(fits_bed),
        "fitsIfRotated": bool(fits_rotated),
        "partCount": int(part_count),
        "triangleCount": int(len(mesh.faces)),
        "boundingBoxMm": bbox,
    }
