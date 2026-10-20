"""In-process Comp-2 pipeline for Streamlit (click-to-start + live Comp-1 risk)."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import OUTPUTS_REPORTS, OUTPUTS_TRACKS, SIM_SEED
from ekf_tracker import run_tracker
from evaluate_tracker import build_playback_payload, evaluate
from simulate_path import simulate_path
from sparse_pings import extract_pings


def seed_from_cell(cell_id: str, base: int = SIM_SEED) -> int:
    h = hashlib.md5(f"{base}:{cell_id}".encode()).hexdigest()
    return int(h[:8], 16)


def _apply_risk_overlay(path: pd.DataFrame, risk_overlay: pd.DataFrame | None) -> pd.DataFrame:
    if risk_overlay is None or "risk_score" not in risk_overlay.columns:
        return path
    keep_cols = ["cell_id", "risk_score"]
    if "habitat_suitability" in risk_overlay.columns:
        keep_cols.append("habitat_suitability")
    risk = risk_overlay[keep_cols].drop_duplicates("cell_id")
    out = path.drop(columns=[c for c in ("risk_score", "habitat_suitability") if c in path.columns])
    out = out.merge(risk, on="cell_id", how="left")
    out["risk_score"] = pd.to_numeric(out["risk_score"], errors="coerce").fillna(0.0)
    return out


def run_from_start_cell(
    start_cell_id: str,
    *,
    seed: int | None = None,
    save_outputs: bool = False,
    risk_overlay: pd.DataFrame | None = None,
    climate_meta: dict | None = None,
) -> dict:
    """
    Simulate → pings → EKF → metrics from a Comp-1 cell.
    Optional risk_overlay: live Comp-1 rainfall-aware scores (cell_id, risk_score, …).
    """
    seed = seed if seed is not None else seed_from_cell(start_cell_id)
    path = simulate_path(seed=seed, start_cell_id=start_cell_id)
    path = _apply_risk_overlay(path, risk_overlay)
    pings = extract_pings(path, seed=seed)
    track = run_tracker(path, pings, risk_overlay=risk_overlay)
    metrics = evaluate(track)
    metrics["start_cell_id"] = start_cell_id
    metrics["sim_seed"] = seed
    if climate_meta:
        metrics["comp1_climate"] = climate_meta
    playback = build_playback_payload(
        track,
        pings,
        metrics,
        start_cell_id=start_cell_id,
    )
    if climate_meta:
        playback["comp1_climate"] = climate_meta
        mk = climate_meta.get("month_key")
        if mk:
            playback["disclaimer"] = (
                f"Simulated path starting on Comp-1 rainfall-aware risk ({mk}). "
                "Not live DWC tracking. Movement stats from Movebank-fitted Kruger GPS."
            )

    if save_outputs:
        OUTPUTS_TRACKS.mkdir(parents=True, exist_ok=True)
        OUTPUTS_REPORTS.mkdir(parents=True, exist_ok=True)
        path.to_parquet(OUTPUTS_TRACKS / "true_path.parquet", index=False)
        pings.to_parquet(OUTPUTS_TRACKS / "hourly_pings.parquet", index=False)
        track.to_parquet(OUTPUTS_TRACKS / "ekf_track.parquet", index=False)
        (OUTPUTS_TRACKS / "playback.json").write_text(
            json.dumps(playback), encoding="utf-8"
        )
        (OUTPUTS_REPORTS / "tracker_metrics.json").write_text(
            json.dumps(metrics, indent=2), encoding="utf-8"
        )
    return playback
