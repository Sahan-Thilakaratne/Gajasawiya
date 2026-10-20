"""
Build / refresh the Component 1 danger map from local processed data.

Runs Phases 2–3 and 5–8 (skips Phase 4 Colab training if the model + risk
scores already exist).

Usage:
  python scripts/build_risk_map.py
  python scripts/build_risk_map.py --from-scratch   # rebuild feature grid too
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
OUT = ROOT / "outputs"


def run(script: str) -> None:
    cmd = [sys.executable, str(SRC / script)]
    print("\n>>>", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(ROOT))


def main() -> None:
    from_scratch = "--from-scratch" in sys.argv

    grid = ROOT / "data" / "processed" / "feature_grid.parquet"
    train = ROOT / "data" / "processed" / "training_set.parquet"
    model = OUT / "xgb_habitat_model.joblib"
    risk = OUT / "maps" / "risk_scores.parquet"

    if from_scratch or not grid.exists():
        osm = ROOT / "data" / "processed" / "osm_layers.gpkg"
        if not osm.exists():
            run("convert_osm.py")
        run("build_feature_grid.py")
    else:
        print(f"Using existing {grid}")

    if from_scratch or not train.exists():
        run("label_presence_background.py")
    else:
        print(f"Using existing {train}")

    if not model.exists() or not risk.exists():
        print(
            "\nPhase 4 model / risk_scores missing.\n"
            "Train on Colab with notebooks/phase4_train_risk_model.ipynb\n"
            "then copy outputs into outputs/ (see docs/colab-notes.md).\n"
            "Cannot continue explain → maps → validate without risk_scores."
        )
        if not risk.exists():
            sys.exit(2)
    else:
        print(f"Using existing model {model}")
        print(f"Using existing risk {risk}")

    run("explain_risk.py")
    run("build_risk_maps.py")
    run("validate_risk_map.py")
    run("export_handoff.py")

    print("\nBuild pipeline finished.")
    print("Handoff pack:", ROOT / "handoff")
    print("Methods note:", ROOT / "docs" / "methods_note.md")


if __name__ == "__main__":
    main()
