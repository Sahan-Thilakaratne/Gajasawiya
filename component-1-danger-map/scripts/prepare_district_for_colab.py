"""
Prepare Polonnaruwa (or any district) data for Phase-4 Colab training.

Usage (from component-1-danger-map, with root or local venv):
  set HEC_DISTRICT=polonnaruwa
  python scripts/prepare_district_for_colab.py polonnaruwa

Steps:
  0) Download district boundary
  1) Phase-1 open data (OSM, climate, occurrences, DEM/WC tiles as needed)
  2) Convert OSM → gpkg
  3) Build feature grid
  4) Build presence/background training_set
  5) Zip Colab upload pack (+ optional pooled AN+PO training set)
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def run(script: str, env: dict | None = None) -> None:
    cmd = [sys.executable, str(SRC / script)]
    print("\n>>>", " ".join(cmd))
    e = os.environ.copy()
    if env:
        e.update(env)
    subprocess.check_call(cmd, cwd=str(ROOT), env=e)


def main() -> None:
    district = (sys.argv[1] if len(sys.argv) > 1 else "polonnaruwa").lower()
    os.environ["HEC_DISTRICT"] = district
    env = {"HEC_DISTRICT": district}

    sys.path.insert(0, str(SRC))
    from districts import district_display, file_tag, processed_dir  # noqa: E402

    display = district_display(district)
    tag = file_tag(district)
    proc = processed_dir(district)
    proc.mkdir(parents=True, exist_ok=True)

    print(f"=== Prepare {display} ({tag}) for Colab ===")
    print(f"Processed dir: {proc}")

    # 0 — boundary
    if not (proc / "study_area.geojson").exists():
        run("download_study_area.py", env)
    else:
        print("Using existing study_area.geojson")

    # 1 — downloads (can take a while)
    run("download_phase1.py", env)

    # 2 — OSM → gpkg
    run("convert_osm.py", env)

    # 3 — feature grid
    run("build_feature_grid.py", env)

    # 4 — training labels
    run("label_presence_background.py", env)

    train = proc / "training_set.parquet"
    grid = proc / "feature_grid.parquet"
    if not train.exists() or not grid.exists():
        raise SystemExit(f"Missing outputs under {proc}")

    # 5 — Colab zip (district-only)
    out_dir = ROOT / "outputs" / "colab_packs"
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_po = out_dir / f"colab_upload_phase4_{tag}.zip"
    with zipfile.ZipFile(zip_po, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(train, arcname="training_set.parquet")
        zf.write(grid, arcname="feature_grid.parquet")
        meta = {
            "district": display,
            "slug": tag,
            "grid_crs": "EPSG:5234",
            "cell_m": 500,
            "train_mode_hint": "district_or_pooled",
        }
        import json

        zf.writestr("district_meta.json", json.dumps(meta, indent=2))
    print("Wrote", zip_po)

    # 6 — optional pooled zip (Anuradhapura + this district)
    an_train = ROOT / "data" / "processed" / "training_set.parquet"
    an_grid = ROOT / "data" / "processed" / "feature_grid.parquet"
    if an_train.exists() and district != "anuradhapura":
        import pandas as pd

        ta = pd.read_parquet(an_train).copy()
        tp = pd.read_parquet(train).copy()
        ta["district"] = "Anuradhapura"
        tp["district"] = display
        pooled = pd.concat([ta, tp], ignore_index=True)
        pooled_path = out_dir / f"training_set_pooled_an_{tag}.parquet"
        pooled.to_parquet(pooled_path, index=False)

        # For Colab: use pooled training + Polonnaruwa grid for scoring that district
        zip_pooled = out_dir / f"colab_upload_phase4_pooled_an_{tag}.zip"
        with zipfile.ZipFile(zip_pooled, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(pooled_path, arcname="training_set.parquet")
            zf.write(grid, arcname="feature_grid.parquet")
            if an_grid.exists():
                zf.write(an_grid, arcname="feature_grid_anuradhapura.parquet")
            zf.writestr(
                "district_meta.json",
                json.dumps(
                    {
                        "district": display,
                        "slug": tag,
                        "train_mode": "pooled_anuradhapura_plus_" + tag,
                        "note": (
                            "training_set.parquet is pooled AN+PO. "
                            "feature_grid.parquet is Polonnaruwa (score this after train). "
                            "Also includes feature_grid_anuradhapura.parquet optionally."
                        ),
                    },
                    indent=2,
                ),
            )
        print("Wrote", zip_pooled)
        print(f"Pooled rows: {len(pooled)} (AN={len(ta)}, {tag}={len(tp)})")
    else:
        print("Skip pooled zip (Anuradhapura training_set missing or same district)")

    readme = out_dir / f"README_COLAB_{tag.upper()}.md"
    readme.write_text(
        f"""# Colab upload — {display}

## Recommended (stronger research claim)

Upload: `colab_upload_phase4_pooled_an_{tag}.zip`

1. Unzip into `/content/`
2. Open `notebooks/phase4_train_risk_model.ipynb` (or the PO notebook)
3. Train on pooled `training_set.parquet`
4. Score `feature_grid.parquet` (Polonnaruwa)
5. Download `phase4_outputs.zip`

## District-only (also OK)

Upload: `colab_upload_phase4_{tag}.zip`

## What to return to the local project

Put these under `component-1-danger-map/`:

| File from Colab | Local path |
|-----------------|------------|
| `xgb_habitat_model.joblib` | `outputs/polonnaruwa/xgb_habitat_model.joblib` |
| `risk_scores.parquet` | `outputs/polonnaruwa/maps/risk_scores.parquet` |
| `spatial_cv_metrics.csv` | `outputs/polonnaruwa/reports/spatial_cv_metrics.csv` |
| `phase4_summary.json` | `outputs/polonnaruwa/reports/phase4_summary.json` |
| plots `*.png` | `outputs/polonnaruwa/reports/` |

If you trained a **pooled** model intended for both districts, also copy:

`outputs/xgb_habitat_model_pooled.joblib`

Then tell the agent — API registration will be finished locally.
""",
        encoding="utf-8",
    )
    print("Wrote", readme)
    print("\nDONE. Upload the zip(s) to Colab and train.")


if __name__ == "__main__":
    main()
