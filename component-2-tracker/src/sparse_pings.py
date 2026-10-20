"""Extract sparse hourly GPS-style pings from the true path."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import OUTPUTS_TRACKS, PING_INTERVAL_HOURS, SIM_DT_MINUTES


def extract_pings(
    path: pd.DataFrame,
    ping_interval_hours: float = PING_INTERVAL_HOURS,
    meas_noise_m: float = 25.0,
    seed: int = 42,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    interval_min = ping_interval_hours * 60.0
    # indices where t_minutes is multiple of interval (within dt tolerance)
    tol = SIM_DT_MINUTES / 2 + 1e-6
    mask = np.isclose((path["t_minutes"] % interval_min), 0.0, atol=tol) | (
        path["t_minutes"] < 1e-9
    )
    pings = path.loc[mask].copy()
    # Ensure last point if nearly on hour
    if path.iloc[-1]["t_minutes"] % interval_min < tol:
        if path.index[-1] not in pings.index:
            pings = pd.concat([pings, path.iloc[[-1]]])

    pings = pings.drop_duplicates(subset=["t_minutes"]).reset_index(drop=True)
    noise = rng.normal(0.0, meas_noise_m, size=(len(pings), 2))
    pings["x_obs"] = pings["x"] + noise[:, 0]
    pings["y_obs"] = pings["y"] + noise[:, 1]
    pings["ping_id"] = np.arange(len(pings))
    return pings[
        [
            "ping_id",
            "step",
            "t_minutes",
            "t_hours",
            "x",
            "y",
            "x_obs",
            "y_obs",
            "cell_id",
            "risk_score",
        ]
    ]


def main() -> None:
    true_path = OUTPUTS_TRACKS / "true_path.parquet"
    if not true_path.exists():
        raise SystemExit("Run simulate_path.py first")
    path = pd.read_parquet(true_path)
    pings = extract_pings(path)
    out = OUTPUTS_TRACKS / "hourly_pings.parquet"
    pings.to_parquet(out, index=False)
    pings.to_csv(OUTPUTS_TRACKS / "hourly_pings.csv", index=False)
    print(f"Pings: {len(pings)} (interval {PING_INTERVAL_HOURS} h)")
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
