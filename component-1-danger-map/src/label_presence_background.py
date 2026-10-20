"""
Phase 3 — presence vs background labels for SDM / risk model training.

- Snap GBIF + iNaturalist points to 500 m cells
- Deduplicate presence cells
- Sample background cells (default 10× presence count)
- Write training table + full-grid presence flag
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    CRS_GEOGRAPHIC,
    CRS_PROJECTED,
    DATA_PROCESSED,
    DATA_RAW,
    DISTRICT_NAME,
    FILE_TAG,
    GRID_RESOLUTION_M,
    OUTPUTS_REPORTS,
    PROJECT_ROOT,
)

RNG_SEED = 42
BACKGROUND_RATIO = 10  # MaxEnt-style; use 1 for balanced 1:1


def load_grid() -> tuple[pd.DataFrame, dict]:
    grid = pd.read_parquet(DATA_PROCESSED / "feature_grid.parquet")
    meta_path = DATA_PROCESSED / "feature_grid_meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        gmeta = meta.get("grid") or meta
    else:
        # recover from cell coordinates
        cell_m = GRID_RESOLUTION_M
        gmeta = {
            "origin_x": float(grid["cx"].min() - cell_m / 2),
            "origin_y": float(grid["cy"].min() - cell_m / 2),
            "cell_m": cell_m,
        }
    return grid, gmeta


def load_occurrence_points() -> gpd.GeoDataFrame:
    rows: list[dict] = []

    gbif = DATA_PROCESSED / f"elephant_occurrences_{FILE_TAG}.csv"
    if gbif.exists():
        df = pd.read_csv(gbif)
        for _, r in df.iterrows():
            rows.append(
                {
                    "source": "GBIF",
                    "record_id": str(r.get("gbif_id")),
                    "lon": float(r["lon"]),
                    "lat": float(r["lat"]),
                    "year": r.get("year"),
                }
            )

    inat = DATA_RAW / "elephant_occurrences" / "inaturalist_elephas_maximus_bbox.csv"
    if inat.exists():
        df = pd.read_csv(inat)
        # filter to district polygon flag from Phase 1
        flag_col = "in_district" if "in_district" in df.columns else "in_anuradhapura"
        mask = df[flag_col].astype(str).str.lower().isin(["true", "1"])
        df = df[mask]
        for _, r in df.iterrows():
            rows.append(
                {
                    "source": "iNaturalist",
                    "record_id": str(r.get("id")),
                    "lon": float(r["lon"]),
                    "lat": float(r["lat"]),
                    "year": str(r.get("observed_on"))[:4] if pd.notna(r.get("observed_on")) else None,
                }
            )

    if not rows:
        raise RuntimeError("No occurrence points found. Run Phase 1 first.")

    gdf = gpd.GeoDataFrame(
        rows,
        geometry=gpd.points_from_xy([r["lon"] for r in rows], [r["lat"] for r in rows]),
        crs=CRS_GEOGRAPHIC,
    ).to_crs(CRS_PROJECTED)
    return gdf


def snap_to_cells(points: gpd.GeoDataFrame, gmeta: dict, grid: pd.DataFrame) -> pd.DataFrame:
    origin_x = float(gmeta["origin_x"])
    origin_y = float(gmeta["origin_y"])
    cell_m = float(gmeta.get("cell_m", GRID_RESOLUTION_M))

    pts = points.copy()
    pts["ix"] = np.floor((pts.geometry.x - origin_x) / cell_m).astype(int)
    pts["iy"] = np.floor((pts.geometry.y - origin_y) / cell_m).astype(int)
    pts["x"] = pts.geometry.x
    pts["y"] = pts.geometry.y

    # keep only points that land on an existing grid cell
    key_grid = set(zip(grid["ix"].astype(int), grid["iy"].astype(int)))
    pts["on_grid"] = [((int(ix), int(iy)) in key_grid) for ix, iy in zip(pts["ix"], pts["iy"])]
    snapped = pts[pts["on_grid"]].copy()

    # join cell_id
    lookup = grid.set_index(["ix", "iy"])["cell_id"].to_dict()
    snapped["cell_id"] = [lookup[(int(ix), int(iy))] for ix, iy in zip(snapped["ix"], snapped["iy"])]
    return snapped.drop(columns="geometry")


def write_bias_note(n_presence: int, n_bg: int, n_records: int, sources: dict) -> Path:
    OUTPUTS_REPORTS.mkdir(parents=True, exist_ok=True)
    path = OUTPUTS_REPORTS / "phase3_occurrence_bias.md"
    path.write_text(
        f"""# Phase 3 — occurrence bias note

**Date:** {date.today().isoformat()}

## What we did

- Combined public elephant sightings (GBIF + iNaturalist) inside {DISTRICT_NAME}.
- Snapped points to the 500 m feature grid and **deduplicated** so each cell is presence at most once.
- Drew a random **background** sample of cells with no sighting ({BACKGROUND_RATIO}× presence count, seed={RNG_SEED}).

| Item | Count |
|------|------:|
| Raw occurrence records used | {n_records} |
| Presence cells (unique) | {n_presence} |
| Background cells | {n_bg} |
| GBIF records (input) | {sources.get('GBIF', 0)} |
| iNaturalist records (input) | {sources.get('iNaturalist', 0)} |

## Bias (state this in the dissertation)

Citizen-science and opportunistic records are **not** a random sample of where elephants live.

1. **People-go bias** — sightings cluster where observers travel (roads, parks, villages), so deep forest interiors are under-sampled.
2. **Access bias** — remote or unsafe areas may have few records even if elephants are present.
3. **Taxonomic / verification bias** — research-grade and museum records differ from casual uploads.
4. **Temporal unevenness** — years and seasons are uneven; we treat all years as one presence set for the prototype.

## How we handle it

- Document the bias openly (this note).
- Use spatial cross-validation in Phase 4 (not random row splits).
- Interpret the model as a **proxy suitability / exposure surface**, not a census of wild elephants.
- Prefer overlap risk (habitat × people) over “forest = danger.”

This limitation is expected for a software-only, open-data student prototype.
""",
        encoding="utf-8",
    )
    return path


def main() -> None:
    print("=== Phase 3: presence vs background ===")
    grid, gmeta = load_grid()
    points = load_occurrence_points()
    sources = points["source"].value_counts().to_dict()
    print(f"Occurrence records: {len(points)} ({sources})")

    snapped = snap_to_cells(points, gmeta, grid)
    print(f"On-grid records: {len(snapped)} / {len(points)}")

    # save point→cell mapping
    snap_path = DATA_PROCESSED / "occurrences_snapped.csv"
    snapped.to_csv(snap_path, index=False)

    presence_ids = sorted(snapped["cell_id"].unique())
    n_pres = len(presence_ids)
    print(f"Unique presence cells: {n_pres}")

    grid = grid.copy()
    grid["presence"] = grid["cell_id"].isin(presence_ids).astype(np.int8)
    grid["n_records"] = (
        snapped.groupby("cell_id").size().reindex(grid["cell_id"]).fillna(0).astype(int).to_numpy()
    )

    # Background sample
    rng = np.random.default_rng(RNG_SEED)
    candidate = grid.loc[grid["presence"] == 0, "cell_id"].to_numpy()
    n_bg = min(len(candidate), n_pres * BACKGROUND_RATIO)
    bg_ids = set(rng.choice(candidate, size=n_bg, replace=False).tolist())
    print(f"Background cells: {n_bg} ({BACKGROUND_RATIO}×)")

    # Training table
    train_ids = set(presence_ids) | bg_ids
    train = grid[grid["cell_id"].isin(train_ids)].copy()
    train["label"] = train["presence"]  # 1 = presence, 0 = background
    train["sample_type"] = np.where(train["label"] == 1, "presence", "background")

    feature_cols = [
        c
        for c in train.columns
        if c
        not in {
            "cell_id",
            "ix",
            "iy",
            "cx",
            "cy",
            "presence",
            "n_records",
            "label",
            "sample_type",
        }
    ]

    out_train = DATA_PROCESSED / "training_set.parquet"
    out_train_csv = DATA_PROCESSED / "training_set.csv"
    out_labeled = DATA_PROCESSED / "feature_grid_labeled.parquet"

    train.to_parquet(out_train, index=False)
    train.to_csv(out_train_csv, index=False)
    grid.to_parquet(out_labeled, index=False)

    # Also a slim labels file
    labels = grid[["cell_id", "ix", "iy", "cx", "cy", "presence", "n_records"]].copy()
    labels["in_training"] = labels["cell_id"].isin(train_ids).astype(np.int8)
    labels.to_csv(DATA_PROCESSED / "cell_labels.csv", index=False)

    bias_path = write_bias_note(n_pres, n_bg, len(points), sources)

    summary = {
        "date": date.today().isoformat(),
        "n_occurrence_records": len(points),
        "n_on_grid_records": int(len(snapped)),
        "n_presence_cells": n_pres,
        "n_background_cells": n_bg,
        "background_ratio": BACKGROUND_RATIO,
        "rng_seed": RNG_SEED,
        "sources": sources,
        "feature_columns": feature_cols,
        "outputs": {
            "training_set": str(out_train.relative_to(PROJECT_ROOT)),
            "feature_grid_labeled": str(out_labeled.relative_to(PROJECT_ROOT)),
            "occurrences_snapped": str(snap_path.relative_to(PROJECT_ROOT)),
            "bias_note": str(bias_path.relative_to(PROJECT_ROOT)),
        },
    }
    summary_path = DATA_PROCESSED / "phase3_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"\nSaved {out_train} ({len(train)} rows)")
    print(f"  presence={int((train['label']==1).sum())} background={int((train['label']==0).sum())}")
    print(f"Saved {out_labeled}")
    print(f"Bias note: {bias_path}")
    print(f"Summary: {summary_path}")
    print("Phase 3 complete.")


if __name__ == "__main__":
    main()
