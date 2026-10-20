"""
Download / refresh open datasets for Component 1 (Phases 0–1).

Usage:
  python scripts/download_all.py
  python scripts/download_all.py --only gbif,inat,osm
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def run(script: str, extra: list[str] | None = None) -> None:
    cmd = [sys.executable, str(SRC / script)] + (extra or [])
    print("\n>>>", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(ROOT))


def main() -> None:
    only = None
    if len(sys.argv) > 1 and sys.argv[1] == "--only":
        only = sys.argv[2]

    run("setup_phase0.py")
    if not (ROOT / "data" / "processed" / "study_area.geojson").exists():
        run("download_study_area.py")

    if only:
        run("download_phase1.py", ["--only", only])
    else:
        run("download_phase1.py")

    print("\nDownload pipeline finished.")
    print("Next: train on Colab (Phase 4) if needed, then python scripts/build_risk_map.py")


if __name__ == "__main__":
    main()
