"""Small HTTP helpers for Phase 1 downloads."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

USER_AGENT = "HEC-DangerMap-StudentProject/1.0 (research; educational)"


def request(url: str, timeout: int = 120) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
    )


def get_json(url: str, timeout: int = 120, retries: int = 4) -> dict | list:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request(url), timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last_err = err
            time.sleep(2 ** attempt)
    raise RuntimeError(f"GET JSON failed: {url}") from last_err


def post_text(url: str, body: str, timeout: int = 300, retries: int = 3) -> bytes:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=body.encode("utf-8"),
                headers={
                    "User-Agent": USER_AGENT,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as err:
            last_err = err
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"POST failed: {url}") from last_err


def download_file(url: str, dest: Path, timeout: int = 600, retries: int = 4) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            print(f"  downloading {url}")
            print(f"  -> {dest.name}")
            with urllib.request.urlopen(request(url), timeout=timeout) as resp:
                total = resp.headers.get("Content-Length")
                read = 0
                chunk = 1024 * 256
                with part.open("wb") as f:
                    while True:
                        buf = resp.read(chunk)
                        if not buf:
                            break
                        f.write(buf)
                        read += len(buf)
                        if total:
                            pct = 100 * read / int(total)
                            print(f"\r  {pct:5.1f}% ({read / 1e6:.1f} MB)", end="", flush=True)
            print()
            part.replace(dest)
            return dest
        except (urllib.error.URLError, TimeoutError) as err:
            last_err = err
            print(f"  retry {attempt + 1}/{retries}: {err}")
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Download failed: {url}") from last_err
