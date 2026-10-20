"""
Phase 0 helper — print confirmed settings and create output folders.
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import (
    CRS_GEOGRAPHIC,
    CRS_PROJECTED,
    DATA_PROCESSED,
    DATA_RAW,
    DISTRICT_NAME,
    GRID_RESOLUTION_M,
    OUTPUTS_MAPS,
    OUTPUTS_REPORTS,
    STUDY_AREA_GEOJSON,
)


def main() -> None:
    for d in (DATA_RAW, DATA_PROCESSED, OUTPUTS_MAPS, OUTPUTS_REPORTS):
        d.mkdir(parents=True, exist_ok=True)

    print("=== Component 1 — Phase 0 settings ===")
    print(f"District:        {DISTRICT_NAME}")
    print(f"Grid size:       {GRID_RESOLUTION_M} m")
    print(f"Projected CRS:   {CRS_PROJECTED}")
    print(f"Geographic CRS:  {CRS_GEOGRAPHIC}")
    print(f"Boundary file:   {STUDY_AREA_GEOJSON}")
    print(f"Boundary exists: {STUDY_AREA_GEOJSON.exists()}")
    print("Folders ready under data/ and outputs/.")
    print()
    print("Note: train the ML model on Google Colab if the laptop is slow;")
    print("keep this folder as the shared project root and upload data/processed there.")


if __name__ == "__main__":
    main()
