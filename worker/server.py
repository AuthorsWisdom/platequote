"""HTTP front for the slicing worker. STL/3MF in, JSON out."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import hmac

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from slice_job import SliceError, engine_version, slice_file


MAX_BYTES = 25 * 1024 * 1024

app = FastAPI(title="PlateQuote slicer", version="0.1.0")


def require_worker_token(x_worker_token: str | None = Header(default=None)) -> None:
    """Shared-secret gate for /slice.

    When SLICER_WORKER_TOKEN is set (it is, on the public Render service), every
    slice request must carry the same value in the X-Worker-Token header. Unset
    means local development with no gate. /health stays open either way.
    """
    expected = os.environ.get("SLICER_WORKER_TOKEN", "")
    if not expected:
        return
    if not x_worker_token or not hmac.compare_digest(x_worker_token, expected):
        raise HTTPException(status_code=401, detail="worker token missing or wrong")


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "engine": "prusaslicer",
        "engineVersion": engine_version(),
        "bin": os.environ.get("PRUSA_SLICER_BIN", "prusa-slicer"),
    }


@app.post("/slice", dependencies=[Depends(require_worker_token)])
async def slice_model(
    file: UploadFile = File(...),
    material: str = Form("pla"),
    density: float = Form(1.24),
    bed_x: float = Form(256),
    bed_y: float = Form(256),
    bed_z: float = Form(256),
):
    name = (file.filename or "").lower()
    if name.endswith(".3mf"):
        suffix = ".3mf"
    elif name.endswith(".stl"):
        suffix = ".stl"
    else:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "unsupported_type",
                "message": "Upload an .stl or .3mf file.",
                "mesh": None,
            },
        )
    if density <= 0 or density > 5 or min(bed_x, bed_y, bed_z) < 10 or max(bed_x, bed_y, bed_z) > 2000:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "bad_request",
                "message": "Density or bed size is out of range.",
                "mesh": None,
            },
        )

    payload = await file.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "ok": False,
                "error": "too_large",
                "message": "The file is over the 25 MB upload cap.",
                "mesh": None,
            },
        )
    if len(payload) < 80:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "empty_file",
                "message": "The file is too small to be a mesh.",
                "mesh": None,
            },
        )

    with tempfile.TemporaryDirectory(prefix="platequote-in-") as directory:
        source = Path(directory) / f"model{suffix}"
        source.write_bytes(payload)
        try:
            return slice_file(
                source,
                material=material,
                density=float(density),
                bed_x=float(bed_x),
                bed_y=float(bed_y),
                bed_z=float(bed_z),
            )
        except SliceError as exc:
            return JSONResponse(
                status_code=422,
                content={
                    "ok": False,
                    "error": exc.code,
                    "message": str(exc),
                    "mesh": exc.mesh,
                },
            )
