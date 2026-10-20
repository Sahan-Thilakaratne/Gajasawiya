"""
Component 2 — Sparse Tracker API (port 8001).

Run (Comp-2 venv):
  cd component-2-tracker
  .\\.venv\\Scripts\\activate
  uvicorn api.main:app --reload --host 0.0.0.0 --port 8001
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from pipeline import run_from_start_cell  # noqa: E402

PLAYBACK = ROOT / "outputs" / "tracks" / "playback.json"
METRICS = ROOT / "outputs" / "reports" / "tracker_metrics.json"

app = FastAPI(
    title="HEC Component 2 — Sparse Tracker API",
    description="Simulate + EKF playback. Research demo — not live DWC tracking.",
    version="0.2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_to_wgs84 = Transformer.from_crs("EPSG:5234", "EPSG:4326", always_xy=True)


class SimulateRequest(BaseModel):
    start_cell_id: str = Field(..., examples=["C0151_0130"])
    save_outputs: bool = True


def _xy_to_lonlat(x: float, y: float) -> tuple[float, float]:
    lon, lat = _to_wgs84.transform(float(x), float(y))
    return float(lon), float(lat)


def _enrich_wgs84(playback: dict) -> dict:
    """Add lon/lat for frames and pings (frontend maps)."""
    frames_out = []
    for f in playback.get("frames") or []:
        lon_t, lat_t = _xy_to_lonlat(f["x_true"], f["y_true"])
        lon_e, lat_e = _xy_to_lonlat(f["x_est"], f["y_est"])
        frames_out.append(
            {
                **f,
                "lon_true": lon_t,
                "lat_true": lat_t,
                "lon_est": lon_e,
                "lat_est": lat_e,
            }
        )
    pings_out = []
    for p in playback.get("pings") or []:
        lon, lat = _xy_to_lonlat(p["x_obs"], p["y_obs"])
        pings_out.append({**p, "lon_obs": lon, "lat_obs": lat})
    out = dict(playback)
    out["frames"] = frames_out
    out["pings"] = pings_out
    out["crs_display"] = "EPSG:4326"
    return out


def _load_playback() -> dict:
    if not PLAYBACK.exists():
        raise HTTPException(
            404,
            "playback.json missing — POST /api/v1/simulate first",
        )
    return _enrich_wgs84(json.loads(PLAYBACK.read_text(encoding="utf-8")))


@app.get("/health")
def health():
    return {
        "ok": True,
        "component": 2,
        "playback_ready": PLAYBACK.exists(),
    }


@app.post("/api/v1/simulate")
def simulate(body: SimulateRequest) -> dict[str, Any]:
    """
    Run habitat path + hourly pings + EKF from a Comp-1 cell_id.
    Returns full playback (WGS84 lon/lat on frames).
    """
    try:
        playback = run_from_start_cell(
            body.start_cell_id,
            save_outputs=body.save_outputs,
        )
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except FileNotFoundError as err:
        raise HTTPException(500, str(err)) from err
    except Exception as err:  # noqa: BLE001
        raise HTTPException(500, f"Simulation failed: {err}") from err
    return _enrich_wgs84(playback)


@app.get("/api/v1/playback")
def get_playback():
    """Last saved playback payload."""
    return _load_playback()


@app.get("/api/v1/metrics")
def get_metrics():
    if METRICS.exists():
        return json.loads(METRICS.read_text(encoding="utf-8"))
    data = _load_playback()
    return data.get("metrics", {})


@app.get("/api/v1/frame/{step}")
def get_frame(step: int):
    data = _load_playback()
    frames = data["frames"]
    if step < 0 or step >= len(frames):
        raise HTTPException(404, f"step out of range 0..{len(frames)-1}")
    return {
        "disclaimer": data.get("disclaimer"),
        "crs": data.get("crs_display", data.get("crs")),
        "step": step,
        "frame": frames[step],
        "n_frames": len(frames),
    }
