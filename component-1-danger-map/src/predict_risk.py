"""
Live risk prediction helpers for the Streamlit demo.

Loads the saved XGBoost model + feature grid, runs inference, returns
a scored table with plain-English explanations.

Optional: district + date → month-specific NASA POWER rainfall/temp
injected into features, then seasonal risk modulation (dry vs wet).
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import DATA_PROCESSED, PROJECT_ROOT, RAW_CLIMATE, STUDY_AREA_GEOJSON
from explain_risk import explanation_phrase, rule_tags, why_sentence
from rainfall_risk import apply_climate_to_grid, seasonal_risk_multiplier

MODEL_PATH = PROJECT_ROOT / "outputs" / "xgb_habitat_model.joblib"
GRID_PATH = DATA_PROCESSED / "feature_grid.parquet"
CLIMATE_JSON = RAW_CLIMATE / "climatology_t2m_prectotcorr_anuradhapura.json"

# Polonnaruwa paths (filled after prepare_district_for_colab + Colab train)
PO_PROC = PROJECT_ROOT / "data" / "processed" / "polonnaruwa"
PO_MODEL = PROJECT_ROOT / "outputs" / "polonnaruwa" / "xgb_habitat_model.joblib"
PO_POOLED_MODEL = PROJECT_ROOT / "outputs" / "xgb_habitat_model_pooled.joblib"
PO_CLIMATE = RAW_CLIMATE / "climatology_t2m_prectotcorr_polonnaruwa.json"

AVAILABLE_DISTRICTS = {
    "Anuradhapura": {
        "grid": GRID_PATH,
        "model": MODEL_PATH,
        "boundary": STUDY_AREA_GEOJSON,
        "climate": CLIMATE_JSON,
    },
}

# Polonnaruwa becomes ready once grid + (district or pooled) model exist
if (PO_PROC / "feature_grid.parquet").exists() and (
    PO_MODEL.exists() or PO_POOLED_MODEL.exists()
):
    AVAILABLE_DISTRICTS["Polonnaruwa"] = {
        "grid": PO_PROC / "feature_grid.parquet",
        "model": PO_MODEL if PO_MODEL.exists() else PO_POOLED_MODEL,
        "boundary": PO_PROC / "study_area.geojson",
        "climate": PO_CLIMATE,
    }

COMING_SOON_DISTRICTS = [
    d
    for d in ["Polonnaruwa", "Hambantota", "Ampara", "Monaragala"]
    if d not in AVAILABLE_DISTRICTS
]


def list_district_options() -> list[str]:
    return list(AVAILABLE_DISTRICTS.keys()) + COMING_SOON_DISTRICTS


def district_is_ready(name: str) -> bool:
    return name in AVAILABLE_DISTRICTS


def load_model_bundle(path: Path | None = None) -> dict:
    path = path or MODEL_PATH
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")
    return joblib.load(path)


def human_exposure_from_grid(df: pd.DataFrame) -> np.ndarray:
    frac_crop = df["frac_crop"].clip(0, 1).to_numpy(dtype=float)
    frac_built = df["frac_built"].clip(0, 1).to_numpy(dtype=float)
    pop = np.nan_to_num(df["pop_density_approx"].to_numpy(dtype=float), nan=0.0)
    q95 = float(np.nanpercentile(pop, 95)) if np.isfinite(pop).any() else 1.0
    pop_norm = np.clip(pop / (q95 + 1e-6), 0, 1)
    raw = 0.4 * frac_crop + 0.4 * frac_built + 0.2 * pop_norm
    lo, hi = np.nanpercentile(raw, [2, 98])
    return np.clip((raw - lo) / (hi - lo + 1e-9), 0, 1)


def predict_district(
    district: str,
    as_of: date | None = None,
    month: int | None = None,
    *,
    use_rainfall: bool = True,
) -> tuple[pd.DataFrame, dict]:
    """
    Run habitat model + overlap risk for a prepared district.

    as_of / month: calendar month for NASA POWER precip/temp.
    use_rainfall: inject climate + seasonal modulation (default True).
    """
    if district not in AVAILABLE_DISTRICTS:
        raise ValueError(
            f"{district} is not prepared yet. Available: {list(AVAILABLE_DISTRICTS)}"
        )
    cfg = AVAILABLE_DISTRICTS[district]
    grid_path = Path(cfg["grid"])
    model_path = Path(cfg["model"])
    if not grid_path.exists():
        raise FileNotFoundError(f"Feature grid missing: {grid_path}")

    bundle = load_model_bundle(model_path)
    model = bundle["model"]
    feature_cols = bundle["feature_cols"]

    grid = pd.read_parquet(grid_path)
    climate_meta: dict = {"rainfall_enabled": False}

    if use_rainfall:
        m = int(month) if month is not None else int((as_of or date.today()).month)
        climate_path = Path(cfg.get("climate") or CLIMATE_JSON)
        if climate_path.exists():
            grid, climate_meta = apply_climate_to_grid(grid, climate_path, m)
            climate_meta["rainfall_enabled"] = True
            climate_meta["as_of"] = (as_of or date.today()).isoformat()
        else:
            climate_meta = {
                "rainfall_enabled": False,
                "warning": f"Climate file missing: {climate_path}",
            }

    missing = [c for c in feature_cols if c not in grid.columns]
    if missing:
        raise RuntimeError(f"Grid missing features: {missing}")

    X = grid[feature_cols].astype(np.float64)
    X = X.fillna(X.median(numeric_only=True))

    habitat = model.predict_proba(X)[:, 1]
    exposure = human_exposure_from_grid(grid)
    risk_base = habitat * exposure

    if climate_meta.get("rainfall_enabled"):
        season_mult = seasonal_risk_multiplier(grid)
        risk = risk_base * season_mult
        risk_formula = (
            "habitat_suitability × human_exposure × seasonal_rainfall_multiplier"
        )
    else:
        season_mult = np.ones(len(grid), dtype=float)
        risk = risk_base
        risk_formula = "habitat_suitability × human_exposure"

    risk_0_100 = 100 * (risk - risk.min()) / (risk.max() - risk.min() + 1e-9)

    out = grid[
        [
            "cell_id",
            "ix",
            "iy",
            "cx",
            "cy",
            "frac_crop",
            "frac_built",
            "frac_tree",
            "forest_edge",
            "protected",
            "dist_settlement_m",
            "dist_water_m",
        ]
    ].copy()
    if "precip_mm" in grid.columns:
        out["precip_mm"] = grid["precip_mm"].to_numpy()
        out["temp_c"] = grid["temp_c"].to_numpy()
        out["precip_anomaly"] = grid.get(
            "precip_anomaly", pd.Series(np.zeros(len(grid)))
        ).to_numpy()
    out["habitat_suitability"] = habitat
    out["human_exposure"] = exposure
    out["seasonal_multiplier"] = season_mult
    out["risk_score"] = risk
    out["risk_score_0_100"] = np.round(risk_0_100, 2)

    explanations = []
    whys = []
    tags_joined = []
    for _, row in out.iterrows():
        tags = list(rule_tags(row))
        if climate_meta.get("rainfall_enabled"):
            anom = float(row.get("precip_anomaly", 0) or 0)
            if anom < -0.15:
                tags.append("dry-season water pull")
            elif anom > 0.15:
                tags.append("wet-season crop pressure")
        phrase = explanation_phrase(tags, float(row["risk_score"]))
        explanations.append(phrase)
        whys.append(why_sentence(row, tags))
        tags_joined.append("|".join(tags))
    out["explanation"] = explanations
    out["why"] = whys
    out["tags"] = tags_joined

    meta = {
        "district": district,
        "n_cells": int(len(out)),
        "model_path": str(model_path),
        "feature_cols": feature_cols,
        "risk_formula": risk_formula,
        "mean_risk": float(out["risk_score"].mean()),
        "max_risk": float(out["risk_score"].max()),
        "n_forest_edge": int((out["forest_edge"] == 1).sum()),
        "boundary": str(cfg["boundary"]),
        "climate": climate_meta,
        "top_cell_ids": out.nlargest(10, "risk_score")["cell_id"].tolist(),
    }
    return out, meta


def build_folium_map(df: pd.DataFrame, boundary_path: Path, top_n: int = 40):
    """Folium map: risk heatmap-style circles + top-risk popups."""
    import folium
    from branca.colormap import LinearColormap
    from pyproj import Transformer

    transformer = Transformer.from_crs("EPSG:5234", "EPSG:4326", always_xy=True)

    lons, lats = transformer.transform(df["cx"].to_numpy(), df["cy"].to_numpy())
    center = [float(np.nanmean(lats)), float(np.nanmean(lons))]

    m = folium.Map(location=center, zoom_start=9, tiles="OpenStreetMap")

    if boundary_path.exists():
        import geopandas as gpd

        study = gpd.read_file(boundary_path)
        if study.crs is None:
            study = study.set_crs(4326)
        study = study.to_crs(4326)
        folium.GeoJson(
            study.__geo_interface__,
            name="District",
            style_function=lambda _: {
                "color": "#222",
                "weight": 2,
                "fillOpacity": 0,
            },
        ).add_to(m)

    vmax = float(np.nanpercentile(df["risk_score"], 98))
    vmax = max(vmax, 1e-6)
    clim = ""
    if "precip_mm" in df.columns:
        clim = f" · precip {float(df['precip_mm'].mean()):.2f} mm/day"
    cmap = LinearColormap(
        colors=["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"],
        vmin=0,
        vmax=vmax,
        caption=f"Overlap risk (p98 stretch){clim}",
    )
    cmap.add_to(m)

    high = df.nlargest(1500, "risk_score")
    rest = df.drop(high.index).sample(
        n=min(2500, max(0, len(df) - len(high))), random_state=42
    )
    sample = pd.concat([high, rest], ignore_index=True)

    for _, r in sample.iterrows():
        lon, lat = transformer.transform(float(r["cx"]), float(r["cy"]))
        score = float(r["risk_score"])
        color = cmap(score)
        folium.CircleMarker(
            location=[lat, lon],
            radius=3,
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.55,
            weight=0,
        ).add_to(m)

    top = df.nlargest(top_n, "risk_score")
    for _, r in top.iterrows():
        lon, lat = transformer.transform(float(r["cx"]), float(r["cy"]))
        precip_bit = ""
        if "precip_mm" in r.index and pd.notna(r.get("precip_mm")):
            precip_bit = f"<br>Precip: {float(r['precip_mm']):.2f} mm/day"
        html = (
            f"<b>{r['cell_id']}</b><br>"
            f"Risk: {float(r['risk_score']):.3f}<br>"
            f"<b>{r['explanation']}</b><br>"
            f"<small>{r['why']}</small>{precip_bit}"
        )
        folium.CircleMarker(
            location=[lat, lon],
            radius=6,
            color="#111",
            fill=True,
            fill_color="#d73027",
            fill_opacity=0.95,
            popup=folium.Popup(html, max_width=320),
            tooltip=f"{r['cell_id']}: {r['explanation']}",
        ).add_to(m)

    folium.LayerControl().add_to(m)
    return m
