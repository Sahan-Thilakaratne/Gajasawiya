"""
Phase 8.2 — export a clean handoff package for Components 3 and 4.

Creates / refreshes: handoff/
  README.md
  manifest.json
  risk_grid.parquet      (table for routing cost weights)
  risk_surface.tif       (raster)
  risk_cells.geojson     (vector + explanation; WGS84)
  study_area.geojson     (district boundary)
  colour_breaks.md
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    CRS_GEOGRAPHIC,
    CRS_PROJECTED,
    DATA_PROCESSED,
    DISTRICT_NAME,
    GRID_RESOLUTION_M,
    OUTPUTS_MAPS,
    OUTPUTS_REPORTS,
    PROJECT_ROOT,
    STUDY_AREA_GEOJSON,
)

HANDOFF = PROJECT_ROOT / "handoff"


def main() -> None:
    HANDOFF.mkdir(parents=True, exist_ok=True)

    # Core table for Component 3 (edge costs) and Component 4 (UI attributes)
    src_table = OUTPUTS_MAPS / "risk_with_explanations.parquet"
    if not src_table.exists():
        src_table = OUTPUTS_MAPS / "risk_scores.parquet"
    df = pd.read_parquet(src_table)

    keep = [
        c
        for c in [
            "cell_id",
            "ix",
            "iy",
            "cx",
            "cy",
            "risk_score",
            "risk_score_0_100",
            "habitat_suitability",
            "human_exposure",
            "explanation",
            "why",
            "tags",
            "forest_edge",
        ]
        if c in df.columns
    ]
    out_table = HANDOFF / "risk_grid.parquet"
    df[keep].to_parquet(out_table, index=False)
    df[keep].to_csv(HANDOFF / "risk_grid.csv", index=False)

    copies = [
        (OUTPUTS_MAPS / "risk_surface.tif", HANDOFF / "risk_surface.tif"),
        (OUTPUTS_MAPS / "risk_cells.geojson", HANDOFF / "risk_cells.geojson"),
        (OUTPUTS_MAPS / "risk_cells.gpkg", HANDOFF / "risk_cells.gpkg"),
        (OUTPUTS_MAPS / "risk_preview.png", HANDOFF / "risk_preview.png"),
        (OUTPUTS_MAPS / "risk_map.html", HANDOFF / "risk_map.html"),
        (OUTPUTS_MAPS / "risk_explanations.json", HANDOFF / "risk_explanations.json"),
        (STUDY_AREA_GEOJSON, HANDOFF / "study_area.geojson"),
        (DATA_PROCESSED / "feature_grid_meta.json", HANDOFF / "feature_grid_meta.json"),
        (OUTPUTS_REPORTS / "phase6_colour_breaks.md", HANDOFF / "colour_breaks.md"),
        (OUTPUTS_REPORTS / "phase7_validation_report.md", HANDOFF / "validation_summary.md"),
        (PROJECT_ROOT / "docs" / "methods_note.md", HANDOFF / "methods_note.md"),
    ]
    copied = []
    missing = []
    for src, dst in copies:
        if src.exists():
            shutil.copy2(src, dst)
            copied.append(dst.name)
        else:
            missing.append(str(src))

    schema = {
        "cell_id": "string — unique 500 m cell id",
        "ix / iy": "integer grid indices (see feature_grid_meta.json)",
        "cx / cy": f"cell centroid metres in {CRS_PROJECTED}",
        "risk_score": "float 0–1 — habitat_suitability × human_exposure (use this for routing cost)",
        "risk_score_0_100": "float — district min–max normalised display score",
        "habitat_suitability": "float 0–1 — P(elephant presence | features)",
        "human_exposure": "float 0–1 — people/crops exposure layer",
        "explanation": "short plain-English label",
        "why": "one-sentence explanation for UI popup",
        "tags": "pipe-separated factor tags",
        "forest_edge": "0/1 flag",
    }

    manifest = {
        "component": 1,
        "name": "HEC danger / overlap risk map",
        "date": date.today().isoformat(),
        "district": DISTRICT_NAME,
        "grid_resolution_m": GRID_RESOLUTION_M,
        "crs_projected": CRS_PROJECTED,
        "crs_geographic": CRS_GEOGRAPHIC,
        "n_cells": int(len(df)),
        "risk_formula": "habitat_suitability * human_exposure",
        "schema": schema,
        "files": sorted({p.name for p in HANDOFF.iterdir() if p.is_file()}),
        "for_component_3": {
            "use": "Weight road graph edges by mean or max risk_score of intersecting cells; optionally boost cost under high risk_score_0_100.",
            "preferred_files": ["risk_grid.parquet", "risk_surface.tif", "risk_cells.gpkg"],
        },
        "for_component_4": {
            "use": "Show coloured risk layer + popup from explanation/why; HTML preview already in risk_map.html.",
            "preferred_files": [
                "risk_cells.geojson",
                "risk_explanations.json",
                "risk_map.html",
                "risk_preview.png",
            ],
        },
        "missing_sources": missing,
    }
    (HANDOFF / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    readme = f"""# Component 1 → handoff pack

**District:** {DISTRICT_NAME} · **Cells:** {len(df):,} × {GRID_RESOLUTION_M} m  
**Risk:** `habitat_suitability × human_exposure` (higher = more conflict-prone overlap)

## Quick start

| Consumer | Start with |
|----------|------------|
| **Component 3** (safe routing) | `risk_grid.parquet` or `risk_surface.tif` — raise travel cost through high `risk_score` cells |
| **Component 4** (UI) | `risk_cells.geojson` + `risk_explanations.json`, or open `risk_map.html` |

Projected coordinates (`cx`, `cy`, GeoTIFF) use **{CRS_PROJECTED}**. GeoJSON is **{CRS_GEOGRAPHIC}**.

## Files

See `manifest.json` for the full list and field schema.

## Do not claim

This is a research prototype, not an official DWC warning feed.
"""
    (HANDOFF / "README.md").write_text(readme, encoding="utf-8")

    print(f"Handoff folder: {HANDOFF}")
    print(f"Copied/updated: {len(copied)} files")
    if missing:
        print("Missing (skipped):")
        for m in missing:
            print(" -", m)
    print("Phase 8.2 handoff export complete.")


if __name__ == "__main__":
    main()
