"""
Download ThermochronTracking Elephants Kruger 2007 from Movebank Data Repository (CC0).

Citation: Slotow, Thaker, Vanak (2019). DOI 10.5441/001/1.403h24q5/1
Licence: CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/

Usage:
  python src/download_movebank.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import DATA_RAW, MOVEBANK_ITEM_UUID, MOVEBANK_STUDY_NAME

API_ITEM = f"https://datarepository.movebank.org/server/api/core/items/{MOVEBANK_ITEM_UUID}"
OUT_DIR = DATA_RAW / "movebank" / MOVEBANK_STUDY_NAME


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "hec-comp2/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _find_bitstreams() -> list[dict]:
    item = _get_json(API_ITEM)
    bundles = _get_json(item["_links"]["bundles"]["href"])
    found = []
    for bundle in bundles.get("_embedded", {}).get("bundles", []):
        bits = _get_json(bundle["_links"]["bitstreams"]["href"])
        for bs in bits.get("_embedded", {}).get("bitstreams", []):
            name = bs.get("name") or ""
            content = bs.get("_links", {}).get("content", {}).get("href")
            if content and name.lower().endswith((".csv", ".csv.gz", ".zip")):
                found.append(
                    {
                        "name": name,
                        "size": bs.get("sizeBytes"),
                        "url": content,
                    }
                )
    return found


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading -> {dest.name} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "hec-comp2/1.0"})
    with urllib.request.urlopen(req, timeout=600) as resp, dest.open("wb") as f:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    print(f"Saved {dest} ({dest.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Movebank Data Repository — Kruger elephants (CC0)")
    print(f"Item: {API_ITEM}")
    try:
        files = _find_bitstreams()
    except urllib.error.URLError as err:
        raise SystemExit(
            f"Could not reach Movebank repository: {err}\n"
            "Download manually from https://doi.org/10.5441/001/1.403h24q5/1 "
            f"into {OUT_DIR}"
        ) from err

    if not files:
        raise SystemExit("No CSV bitstreams found on the item page.")

    for meta in files:
        dest = OUT_DIR / meta["name"]
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"Already present: {dest.name}")
            continue
        print(f"Found {meta['name']} ({meta.get('size')} bytes)")
        download_file(meta["url"], dest)

    readme = OUT_DIR / "README.txt"
    readme.write_text(
        "ThermochronTracking Elephants Kruger 2007\n"
        "Slotow R, Thaker M, Vanak AT. 2019. Movebank Data Repository.\n"
        "https://doi.org/10.5441/001/1.403h24q5/1\n"
        "Licence: CC0 1.0\n"
        "Used only to fit movement statistics for Comp-2 (NOT Sri Lankan DWC data).\n",
        encoding="utf-8",
    )
    print("Done. Next: python src/fit_movement_params.py")


if __name__ == "__main__":
    main()
