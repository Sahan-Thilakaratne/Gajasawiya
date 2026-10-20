"""Run Component 2 pipeline: (optional Movebank fit) → simulate → pings → EKF → evaluate."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC))
from config import DATA_RAW, MOVEMENT_PARAMS_PATH, MOVEBANK_STUDY_NAME  # noqa: E402


def run(script: str) -> None:
    cmd = [sys.executable, str(SRC / script)]
    print("\n>>>", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(ROOT))


def movement_is_fitted() -> bool:
    if not MOVEMENT_PARAMS_PATH.exists():
        return False
    p = json.loads(MOVEMENT_PARAMS_PATH.read_text(encoding="utf-8"))
    return p.get("source") == "movebank_fitted"


def ensure_movebank_params() -> None:
    csv_dir = DATA_RAW / "movebank" / MOVEBANK_STUDY_NAME
    has_csv = csv_dir.exists() and any(
        p.suffix.lower() == ".csv" and "reference" not in p.name.lower()
        for p in csv_dir.glob("*.csv")
    )
    if movement_is_fitted() and has_csv:
        print("Movebank-fitted movement_params.json already present.")
        return
    if not has_csv:
        print("Downloading Movebank Kruger GPS (CC0)…")
        run("download_movebank.py")
    print("Fitting movement parameters from Movebank…")
    run("fit_movement_params.py")


def main() -> None:
    for d in ("outputs/tracks", "outputs/maps", "outputs/reports", "data/processed", "data/raw"):
        (ROOT / d).mkdir(parents=True, exist_ok=True)
    ensure_movebank_params()
    run("simulate_path.py")
    run("sparse_pings.py")
    run("ekf_tracker.py")
    run("evaluate_tracker.py")
    print("\nComponent 2 pipeline finished.")
    print("See outputs/reports/evaluation_report.md and outputs/tracks/playback.json")


if __name__ == "__main__":
    main()
