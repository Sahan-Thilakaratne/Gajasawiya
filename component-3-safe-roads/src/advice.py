"""
Plain-English Comp-3 advice near the elephant wandering area.
Uses OSM road names + nearest settlement names when available.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from config import COMP1_OSM_GPKG, COMP1_RISK_PARQUET

_SETTLE: pd.DataFrame | None = None
_SETTLE_TREE: cKDTree | None = None


def _load_settlements() -> tuple[pd.DataFrame, cKDTree]:
    global _SETTLE, _SETTLE_TREE
    if _SETTLE is not None and _SETTLE_TREE is not None:
        return _SETTLE, _SETTLE_TREE
    gdf = gpd.read_file(COMP1_OSM_GPKG, layer="settlements")
    gdf = gdf[gdf.geometry.notnull() & gdf["name"].notna()].copy()
    gdf["name"] = gdf["name"].astype(str).str.strip()
    gdf = gdf[gdf["name"].str.len() > 0]
    # centroid in projected CRS (file is already EPSG:5234 from Comp-1)
    cents = gdf.geometry.centroid
    df = pd.DataFrame(
        {
            "name": gdf["name"].to_numpy(),
            "place": gdf["place"].fillna("").astype(str).to_numpy()
            if "place" in gdf.columns
            else "",
            "x": cents.x.to_numpy(dtype=float),
            "y": cents.y.to_numpy(dtype=float),
        }
    )
    # Prefer village/town/hamlet style places when duplicates
    tree = cKDTree(np.column_stack([df["x"], df["y"]]))
    _SETTLE, _SETTLE_TREE = df, tree
    return _SETTLE, _SETTLE_TREE


def _nearest_places(x: float, y: float, k: int = 3, max_m: float = 8000.0) -> list[str]:
    settle, tree = _load_settlements()
    k = min(k, len(settle))
    if k <= 0:
        return []
    dists, idxs = tree.query([x, y], k=k)
    if np.isscalar(dists):
        dists, idxs = [float(dists)], [int(idxs)]
    names: list[str] = []
    seen: set[str] = set()
    for d, i in zip(dists, idxs):
        if float(d) > max_m:
            continue
        n = str(settle.iloc[int(i)]["name"])
        if n.lower() in seen:
            continue
        seen.add(n.lower())
        names.append(n)
    return names


def _road_label(name: Any, highway: Any) -> str | None:
    n = str(name).strip() if name is not None and not (isinstance(name, float) and np.isnan(name)) else ""
    if n and n.lower() not in ("none", "nan"):
        return n
    hw = str(highway or "").strip().lower()
    if hw in ("trunk", "primary", "secondary", "tertiary"):
        return f"unnamed {hw} road"
    return None


def _why_from_comp1(cx: float, cy: float) -> str | None:
    """Nearest Comp-1 cell explanation if present."""
    try:
        risk = pd.read_parquet(COMP1_RISK_PARQUET)
    except Exception:
        return None
    if "cx" not in risk.columns or "explanation" not in risk.columns:
        return None
    xy = np.column_stack(
        [
            pd.to_numeric(risk["cx"], errors="coerce").to_numpy(),
            pd.to_numeric(risk["cy"], errors="coerce").to_numpy(),
        ]
    )
    tree = cKDTree(xy)
    _, i = tree.query([cx, cy])
    row = risk.iloc[int(i)]
    expl = str(row.get("explanation") or "").strip()
    why = str(row.get("why") or "").strip()
    if expl and expl.lower() not in ("nan", "none", ""):
        if why and why.lower() not in ("nan", "none", ""):
            return f"{expl} ({why})"
        return expl
    return why or None


def build_advice(
    *,
    elephant_xy: tuple[float, float],
    elephant_radius_m: float,
    hour_of_day: int,
    scored_risky: pd.DataFrame,
    n_risky: int,
    n_safe: int,
) -> dict[str, Any]:
    """
    Returns headline, bullets, and structured fields for the UI.
    """
    ex, ey = elephant_xy
    places = _nearest_places(ex, ey, k=4, max_m=10000.0)
    area_a = places[0] if places else None
    area_b = places[1] if len(places) > 1 else None

    # Named risky roads (by length-weighted risk)
    road_scores: Counter[str] = Counter()
    if scored_risky is not None and len(scored_risky):
        for _, row in scored_risky.iterrows():
            label = _road_label(row.get("name"), row.get("highway"))
            if not label:
                continue
            w = float(row.get("segment_risk", 0.5)) * float(row.get("length_m", 100.0))
            road_scores[label] += w

    top_roads = [r for r, _ in road_scores.most_common(4)]

    why = _why_from_comp1(ex, ey)
    hour_note = (
        "evening/dusk movement is often higher"
        if hour_of_day in (17, 18, 19, 5, 6, 7)
        else "daytime risk is still elevated near the estimated animal"
        if 8 <= hour_of_day <= 16
        else "night-time movement risk is elevated"
    )

    bullets: list[str] = []

    if n_risky == 0:
        headline = (
            f"No high-risk road stretches flagged within about {int(elephant_radius_m)} m "
            f"of the estimate"
            + (f" near {area_a}" if area_a else "")
            + "."
        )
        bullets.append(
            "Still keep clear of the green uncertainty circle — the tracker is not exact."
        )
        if area_a:
            bullets.append(
                f"Stay alert around {area_a}"
                + (f" and {area_b}" if area_b else "")
                + " until the next location update."
            )
    else:
        if area_a and area_b:
            headline = (
                f"Avoid risky roads between {area_a} and {area_b} — "
                f"{n_risky} red stretch(es) near the estimated elephant."
            )
        elif area_a:
            headline = (
                f"Avoid risky roads near {area_a} — "
                f"{n_risky} red stretch(es) inside the wander area."
            )
        else:
            headline = (
                f"Avoid the red road stretches near the elephant circle "
                f"({n_risky} flagged)."
            )

        if top_roads:
            if len(top_roads) == 1:
                bullets.append(
                    f"Do not use **{top_roads[0]}** through this zone while the circle overlaps it."
                )
            else:
                listed = ", ".join(top_roads[:3])
                bullets.append(
                    f"Do not use these roads through the red zone right now: {listed}."
                )

        if area_a:
            stay = f"Do not linger near {area_a}"
            if area_b:
                stay += f" / {area_b}"
            stay += " (settlements closest to the estimate)."
            bullets.append(stay)

        if why:
            bullets.append(f"Land risk here looks like: {why}.")

        bullets.append(
            f"At {hour_of_day}:00, {hour_note} — prefer green roads farther from the circle."
        )

        bullets.append(
            "Red marks roads next to the estimate/path (or extreme land risk farther out)."
        )

        if n_safe > 0:
            bullets.append(
                f"{n_safe} stretch(es) farther from the animal scored safer (green)."
            )

    # Strip markdown stars for a plain field too
    plain_bullets = [b.replace("**", "") for b in bullets]

    return {
        "headline": headline.replace("**", ""),
        "bullets": plain_bullets,
        "avoid_roads": top_roads,
        "nearby_places": places[:4],
        "land_reason": why,
        "hour_of_day": hour_of_day,
    }
