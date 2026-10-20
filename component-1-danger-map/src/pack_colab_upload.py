"""Zip the two parquet files needed for Phase 4 Colab training."""

from __future__ import annotations

import zipfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import DATA_PROCESSED, OUTPUTS_MAPS, PROJECT_ROOT

FILES = [
    DATA_PROCESSED / "training_set.parquet",
    DATA_PROCESSED / "feature_grid.parquet",
]


def main() -> None:
    out_dir = PROJECT_ROOT / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / "colab_upload_phase4.zip"
    missing = [p for p in FILES if not p.exists()]
    if missing:
        raise SystemExit("Missing: " + ", ".join(str(m) for m in missing))

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in FILES:
            zf.write(p, arcname=p.name)
            print("added", p.name, f"({p.stat().st_size / 1e6:.2f} MB)")
    print("Wrote", zip_path)
    print("Upload this zip to Colab, unzip into /content/, open notebooks/phase4_train_risk_model.ipynb")


if __name__ == "__main__":
    main()
