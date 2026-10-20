"""
Component 1 — study area and grid settings (Phase 0).

Set HEC_DISTRICT=anuradhapura|polonnaruwa to switch active district paths.
Default remains Anuradhapura for backward compatibility.
"""

from pathlib import Path
import os

from districts import (  # noqa: E402
    PROJECT_ROOT,
    active_district,
    district_display,
    file_tag,
    nominatim_query,
    processed_dir,
    raw_osm_dir,
)

# Project root = parent of src/
# (imported from districts for a single source of truth)

DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_PROCESSED = processed_dir()  # active district processed root
OUTPUTS_MAPS = PROJECT_ROOT / "outputs" / "maps"
OUTPUTS_REPORTS = PROJECT_ROOT / "outputs" / "reports"

DISTRICT_SLUG = active_district()
DISTRICT_NAME = district_display()
COUNTRY = "Sri Lanka"
STUDY_AREA_GEOJSON = DATA_PROCESSED / "study_area.geojson"

GRID_RESOLUTION_M = 500
CRS_PROJECTED = "EPSG:5234"
CRS_GEOGRAPHIC = "EPSG:4326"

NOMINATIM_QUERY = nominatim_query()

# Phase 1 raw data folders (national rasters shared; OSM may be district-scoped)
RAW_OCCURRENCES = DATA_RAW / "elephant_occurrences"
RAW_WORLDCOVER = DATA_RAW / "worldcover"
RAW_OSM = raw_osm_dir()
RAW_WORLDPOP = DATA_RAW / "worldpop"
RAW_CLIMATE = DATA_RAW / "nasa_power"
RAW_DEM = DATA_RAW / "dem"
RAW_WDPA = DATA_RAW / "wdpa"

FILE_TAG = file_tag()  # anuradhapura | polonnaruwa


def reload_district(slug: str) -> None:
    """Call after setting os.environ['HEC_DISTRICT'] in long-running processes."""
    global DATA_PROCESSED, DISTRICT_SLUG, DISTRICT_NAME, STUDY_AREA_GEOJSON
    global NOMINATIM_QUERY, RAW_OSM, FILE_TAG
    os.environ["HEC_DISTRICT"] = slug
    DISTRICT_SLUG = active_district()
    DISTRICT_NAME = district_display()
    DATA_PROCESSED = processed_dir()
    STUDY_AREA_GEOJSON = DATA_PROCESSED / "study_area.geojson"
    NOMINATIM_QUERY = nominatim_query()
    RAW_OSM = raw_osm_dir()
    FILE_TAG = file_tag()
