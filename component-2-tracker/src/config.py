"""
Component 2 — sparse tracker settings.
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
COMP1_ROOT = PROJECT_ROOT.parent / "component-1-danger-map"

DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
OUTPUTS = PROJECT_ROOT / "outputs"
OUTPUTS_TRACKS = OUTPUTS / "tracks"
OUTPUTS_MAPS = OUTPUTS / "maps"
OUTPUTS_REPORTS = OUTPUTS / "reports"

# Component 1 inputs
COMP1_FEATURE_GRID = COMP1_ROOT / "data" / "processed" / "feature_grid.parquet"
COMP1_HANDOFF_RISK = COMP1_ROOT / "handoff" / "risk_grid.parquet"
COMP1_BOUNDARY = COMP1_ROOT / "handoff" / "study_area.geojson"
COMP1_META = COMP1_ROOT / "handoff" / "feature_grid_meta.json"

DISTRICT_NAME = "Anuradhapura"
CRS_PROJECTED = "EPSG:5234"
CRS_GEOGRAPHIC = "EPSG:4326"
GRID_RESOLUTION_M = 500

# Simulation
SIM_SEED = 42
SIM_DURATION_HOURS = 48
SIM_DT_MINUTES = 15  # fine path step
PING_INTERVAL_HOURS = 1  # sparse collar

# Movement proxy (African elephant literature / Movebank-style defaults)
# See docs/movebank_citation.md — NOT Sri Lankan DWC data.
MOVEMENT_PARAMS_PATH = DATA_PROCESSED / "movement_params.json"
MOVEBANK_STUDY_NAME = "ThermochronTracking Elephants Kruger 2007"
MOVEBANK_CITATION_DOI = "10.5441/001/1.403h24q5/1"
# Parent datapackage item (holds CSV bitstreams); child /1 DOI page has metadata only
MOVEBANK_ITEM_UUID = "b777279a-581d-43ce-b790-8e60304fb8b4"

# Tracker
EKF_PROCESS_VAR_POS = 0.5 ** 2  # legacy keys (EKF uses ACCEL_PSD in ekf_tracker)
EKF_PROCESS_VAR_VEL = 0.02 ** 2
EKF_MEAS_VAR = 30.0 ** 2  # GPS-like measurement noise m^2
ALERT_RISK_THRESHOLD = 0.05  # Comp-1 risk_score for circle-overlap alert
ALERT_DIST_SETTLEMENT_M = 1500.0

# Habitat-biased predict: pull estimate toward Comp-1 preferred cells (0=off)
HABITAT_BIAS_STRENGTH = 0.22
HABITAT_BIAS_RADIUS_M = 1200.0
