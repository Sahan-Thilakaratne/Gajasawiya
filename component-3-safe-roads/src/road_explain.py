"""
Transparent “why is this road risky?” explanations from existing Comp-3 inputs.

These are input-based factors (distance, circle overlap, Comp-1 land attributes,
display colour rules) — not SHAP / calibrated model attributions.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from config import (
    FORCE_RED_UNDER_CIRCLE,
    HIGH_RISK_PRED,
    MODEL_FAR_RED,
    MODEL_FRINGE_RED,
    MODEL_NEAR_RED,
    PATH_NEAR_M,
)
from features import diurnal_activity


def risk_category(segment_risk: float, risk_class: str) -> str:
    """Human label for UI (display class + proxy score band)."""
    r = float(segment_risk)
    if risk_class == "risky":
        if r >= HIGH_RISK_PRED:
            return "High (flagged risky)"
        if r >= MODEL_FRINGE_RED:
            return "Elevated (flagged risky)"
        return "Caution (flagged risky - proximity)"
    if r >= MODEL_FAR_RED:
        return "Elevated model score (shown safer)"
    if r >= MODEL_NEAR_RED:
        return "Moderate proxy score (shown safer)"
    return "Lower proxy score (safer)"


def _num(row: pd.Series | dict, key: str, default: float = 0.0) -> float:
    try:
        v = row.get(key, default) if hasattr(row, "get") else default
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return float(default)
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def _road_title(row: pd.Series | dict, edge_id: str) -> str:
    name = row.get("name") if hasattr(row, "get") else None
    if name is not None and not (isinstance(name, float) and np.isnan(name)):
        s = str(name).strip()
        if s and s.lower() not in ("none", "nan"):
            return s
    hw = str(row.get("highway") or "").strip()
    if hw:
        return f"Unnamed {hw} ({edge_id})"
    return str(edge_id)


REASON_PHRASES = {
    "under_circle": "Inside or under the Comp-2 uncertainty circle around the estimated elephant.",
    "near_path": "Close to the recent simulated wander path.",
    "near_elephant": "Near the estimated elephant location (proximity + corridor score).",
    "proximity_caution": "Very close to the animal/path, so treated as risky for the demo.",
    "fringe_land_risk": "Just outside the circle, with a higher corridor model score.",
    "far_extreme_land": "Farther away, but Comp-1 / corridor proxy risk is extreme.",
    "near_but_low_model": "Near the animal, but the corridor model score is low.",
    "fringe_ok": "In the fringe zone with moderate/low corridor score — shown safer.",
    "far_safe": "Outside the near zone with non-extreme corridor score — shown safer.",
}


def explain_road(
    row: pd.Series | dict,
    *,
    risk_class: str,
    display_reason: str,
    elephant_radius_m: float,
    path_dist_m: float | None,
    hour_of_day: int,
) -> dict[str, Any]:
    """Build explanation payload for one scored road segment."""
    edge_id = str(row.get("edge_id", ""))
    risk = _num(row, "segment_risk")
    e_dist = _num(row, "elephant_dist_m", 1e9)
    p_dist = float(path_dist_m) if path_dist_m is not None and np.isfinite(path_dist_m) else None
    under = e_dist <= max(float(elephant_radius_m), 1.0)
    land = _num(row, "risk_mean")
    hum = _num(row, "human_exposure")
    crop = _num(row, "frac_crop")
    built = _num(row, "frac_built")
    settle = _num(row, "dist_settlement_m", 99999.0)
    forest_edge = _num(row, "forest_edge")
    highway = str(row.get("highway") or "").strip() or "unknown"
    diurnal = diurnal_activity(int(hour_of_day))

    factors: list[dict[str, Any]] = []
    factors.append(
        {
            "id": "elephant_distance",
            "label": "Distance to estimated elephant",
            "value": f"{e_dist:,.0f} m",
            "note": (
                "Inside uncertainty circle"
                if under
                else f"Circle radius ≈ {float(elephant_radius_m):,.0f} m"
            ),
        }
    )
    factors.append(
        {
            "id": "uncertainty_overlap",
            "label": "Intersects / near EKF uncertainty area",
            "value": "Yes" if under else "No",
            "note": (
                "Forced risky under circle"
                if under and FORCE_RED_UNDER_CIRCLE
                else "Outside current circle"
            ),
        }
    )
    if p_dist is not None:
        factors.append(
            {
                "id": "path_distance",
                "label": "Distance to recent wander path",
                "value": f"{p_dist:,.0f} m",
                "note": (
                    f"Near-path band ≈ {PATH_NEAR_M:.0f} m"
                    if p_dist <= PATH_NEAR_M
                    else "Outside near-path band"
                ),
            }
        )
    factors.append(
        {
            "id": "comp1_land_risk",
            "label": "Nearby Comp-1 land risk (proxy)",
            "value": f"{land:.3f}",
            "note": "From nearest Comp-1 grid cell (seasonal map when Comp-1 rainfall is on)",
        }
    )
    factors.append(
        {
            "id": "land_use_edge",
            "label": "Crop / built / forest-edge context",
            "value": f"crop {crop:.2f} · built {built:.2f} · forest_edge {int(forest_edge)}",
            "note": (
                f"Settlement ~{settle:,.0f} m"
                if settle < 90000
                else "Settlement distance unavailable"
            ),
        }
    )
    factors.append(
        {
            "id": "road_type",
            "label": "Road type (OSM highway)",
            "value": highway,
            "note": f"Hour {int(hour_of_day)}:00 · diurnal activity weight {diurnal:.2f}",
        }
    )

    bullets: list[str] = []
    phrase = REASON_PHRASES.get(display_reason)
    if phrase:
        bullets.append(phrase)
    if under:
        bullets.append(
            f"About {e_dist:,.0f} m from the estimate — within the "
            f"{float(elephant_radius_m):,.0f} m uncertainty circle."
        )
    elif e_dist < 5000:
        bullets.append(f"About {e_dist:,.0f} m from the estimated elephant location.")
    if p_dist is not None and p_dist <= PATH_NEAR_M:
        bullets.append(f"Within ~{PATH_NEAR_M:.0f} m of the recent simulated path.")
    if land >= 0.15:
        bullets.append(f"Nearby Comp-1 land-risk proxy is elevated ({land:.2f}).")
    elif land >= 0.05:
        bullets.append(f"Nearby Comp-1 land-risk proxy is moderate ({land:.2f}).")
    if hum >= 0.35 or crop >= 0.25:
        bullets.append("Human exposure / farmland edge indicators are relatively high here.")
    if settle <= 1500:
        bullets.append(f"Settlement features are nearby (~{settle:,.0f} m).")
    if risk_class == "risky" and risk < MODEL_NEAR_RED and under:
        bullets.append(
            "Shown risky mainly due to proximity under the uncertainty circle, "
            "not a high corridor-model score alone."
        )
    if not bullets:
        bullets.append("Shown using proximity-first colouring plus the corridor proxy score.")

    return {
        "edge_id": edge_id,
        "title": _road_title(row, edge_id),
        "segment_risk": round(risk, 4),
        "risk_class": risk_class,
        "risk_category": risk_category(risk, risk_class),
        "display_reason": display_reason,
        "summary": bullets,
        "factors": factors,
        "method": "rule_based_inputs",
    }
