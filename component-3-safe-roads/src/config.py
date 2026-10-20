"""Component 3 — Safe-road finder configuration."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALI_ROOT = ROOT.parent

COMP1 = ALI_ROOT / "component-1-danger-map"
COMP2 = ALI_ROOT / "component-2-tracker"

CRS_PROJECTED = "EPSG:5234"
CRS_WGS84 = "EPSG:4326"
DISTRICT = "Anuradhapura"
API_PORT = 8002
GRID_RESOLUTION_M = 500

# Comp-1 inputs
COMP1_OSM_GPKG = COMP1 / "data" / "processed" / "osm_layers.gpkg"
COMP1_RISK_PARQUET = COMP1 / "handoff" / "risk_grid.parquet"
COMP1_FEATURE_GRID = COMP1 / "data" / "processed" / "feature_grid.parquet"
COMP1_BOUNDARY = COMP1 / "handoff" / "study_area.geojson"

# Comp-2 (optional dynamic features)
COMP2_PLAYBACK = COMP2 / "outputs" / "tracks" / "playback.json"

DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"
OUTPUTS_ROUTES = ROOT / "outputs" / "routes"
OUTPUTS_ALERTS = ROOT / "outputs" / "alerts"
OUTPUTS_REPORTS = ROOT / "outputs" / "reports"

# Graph build
NODE_ROUND_M = 5.0  # snap vertices for shared nodes
MAX_SEGMENT_M = 400.0  # chop long edges for ML rows
MIN_SEGMENT_M = 15.0
KEEP_HIGHWAY = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "living_street",
    "road",
    "primary_link",
    "secondary_link",
    "tertiary_link",
    "trunk_link",
    "motorway_link",
}

# Label proxy (Phase 2) — relative to road-segment risk distribution
# Absolute Comp-1 risk on roads is low; use percentile + human edge.
LABEL_RISK_PERCENTILE = 85.0  # top 15% of segment risk_mean among roads
LABEL_HUMAN_EXPOSURE_MIN = 0.20
LABEL_DIST_SETTLEMENT_M = 2000.0
LABEL_FOREST_EDGE_FRAC = 0.2
LABEL_RISK_MIN = 0.05  # floor so ultra-low risk never labels positive


LOCAL_BUFFER_M = 1200.0  # metres beyond Comp-2 uncertainty circle (tighter focus)
HIGH_RISK_PRED = 0.55

# Local road colouring — proximity-first (demo-friendly)
# Near the elephant / path → tend red; far → green unless land risk is extreme.
PATH_NEAR_M = 400.0          # treat as "next to the wander path"
FRINGE_EXTRA_M = 600.0       # soft zone outside the circle
MODEL_NEAR_RED = 0.20        # in/near circle: red if model >= this (low bar)
MODEL_FRINGE_RED = 0.40      # fringe: need clearer model risk
MODEL_FAR_RED = 0.80         # outer buffer: only extreme land risk goes red
FORCE_RED_UNDER_CIRCLE = True  # roads under uncertainty circle always red

# Routing (optional A→B)
LAMBDA_SEGMENT_RISK = 12.0

# Dynamic feature defaults for dataset augmentation (Colab can use these columns)
AUGMENT_HOURS = (6, 12, 18, 22)  # dawn / midday / dusk / night
ELEPHANT_DIST_BINS_M = (200.0, 800.0, 2000.0, 5000.0)
