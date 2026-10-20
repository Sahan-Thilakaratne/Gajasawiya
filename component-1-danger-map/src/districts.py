"""Multi-district path helpers for Component 1."""
from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Canonical keys (lowercase slug)
DISTRICT_META = {
    "anuradhapura": {
        "display": "Anuradhapura",
        "nominatim": "Anuradhapura District, Sri Lanka",
    },
    "polonnaruwa": {
        "display": "Polonnaruwa",
        "nominatim": "Polonnaruwa District, Sri Lanka",
    },
}


def normalize_district(name: str | None) -> str:
    if not name:
        return "anuradhapura"
    key = name.strip().lower().replace(" ", "")
    aliases = {
        "anuradhapura": "anuradhapura",
        "polonnaruwa": "polonnaruwa",
        "polo": "polonnaruwa",
    }
    if key not in aliases:
        raise ValueError(f"Unknown district '{name}'. Known: {list(DISTRICT_META)}")
    return aliases[key]


def active_district() -> str:
    return normalize_district(os.environ.get("HEC_DISTRICT", "anuradhapura"))


def district_display(slug: str | None = None) -> str:
    slug = normalize_district(slug or active_district())
    return DISTRICT_META[slug]["display"]


def nominatim_query(slug: str | None = None) -> str:
    slug = normalize_district(slug or active_district())
    return DISTRICT_META[slug]["nominatim"]


def processed_dir(slug: str | None = None) -> Path:
    """
    Anuradhapura keeps legacy flat paths under data/processed/.
    Other districts use data/processed/<slug>/.
    """
    slug = normalize_district(slug or active_district())
    if slug == "anuradhapura":
        return PROJECT_ROOT / "data" / "processed"
    return PROJECT_ROOT / "data" / "processed" / slug


def raw_osm_dir(slug: str | None = None) -> Path:
    slug = normalize_district(slug or active_district())
    if slug == "anuradhapura":
        return PROJECT_ROOT / "data" / "raw" / "osm"
    return PROJECT_ROOT / "data" / "raw" / "osm" / slug


def file_tag(slug: str | None = None) -> str:
    """Suffix used in many existing filenames (anuradhapura / polonnaruwa)."""
    return normalize_district(slug or active_district())
