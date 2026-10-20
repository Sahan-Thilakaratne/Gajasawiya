"""Evaluate sparse tracker against hidden true path."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import OUTPUTS_MAPS, OUTPUTS_REPORTS, OUTPUTS_TRACKS, PING_INTERVAL_HOURS


def minutes_since_ping(track: pd.DataFrame) -> pd.Series:
    """Time since last ping_update along the track."""
    since = np.zeros(len(track))
    last = 0.0
    for i, row in enumerate(track.itertuples(index=False)):
        if row.ping_update:
            last = row.t_minutes
            since[i] = 0.0
        else:
            since[i] = row.t_minutes - last
    return pd.Series(since, index=track.index, name="minutes_since_ping")


def evaluate(track: pd.DataFrame) -> dict:
    track = track.copy()
    track["minutes_since_ping"] = minutes_since_ping(track)

    def err_at(lo: float, hi: float) -> float:
        m = (track["minutes_since_ping"] >= lo) & (track["minutes_since_ping"] < hi)
        if not m.any():
            return float("nan")
        return float(track.loc[m, "error_m"].mean())

    metrics = {
        "n_steps": int(len(track)),
        "ping_interval_hours": PING_INTERVAL_HOURS,
        "mean_error_m": float(track["error_m"].mean()),
        "median_error_m": float(track["error_m"].median()),
        "p90_error_m": float(track["error_m"].quantile(0.9)),
        "mean_error_15_30_min": err_at(15, 30),
        "mean_error_30_45_min": err_at(30, 45),
        "mean_error_45_60_min": err_at(45, 60),
        "calibration_truth_inside_circle_pct": float(100 * track["truth_inside_circle"].mean()),
        "alert_steps": int(track["alert"].sum()),
        "alert_pct": float(100 * track["alert"].mean()),
    }
    return metrics


def plot_error_over_time(track: pd.DataFrame, out: Path) -> None:
    fig, ax = plt.subplots(figsize=(9, 4))
    ax.plot(track["t_hours"], track["error_m"], color="#2f6f4e", lw=1, label="Error (m)")
    ax.plot(
        track["t_hours"],
        track["uncertainty_radius_m"],
        color="#d73027",
        lw=1,
        alpha=0.8,
        label="Uncertainty radius (2σ)",
    )
    pings = track[track["ping_update"] == 1]
    ax.scatter(pings["t_hours"], pings["error_m"], c="black", s=18, zorder=5, label="Hourly ping")
    ax.set_xlabel("Hours")
    ax.set_ylabel("Metres")
    ax.set_title("Sparse tracker: error vs uncertainty (simulated path)")
    ax.legend()
    plt.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def plot_path_map(track: pd.DataFrame, pings: pd.DataFrame, out: Path) -> None:
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.plot(track["x_true"], track["y_true"], color="#888888", lw=1, label="True path")
    ax.plot(track["x_est"], track["y_est"], color="#2f6f4e", lw=1.2, label="EKF estimate")
    ax.scatter(pings["x_obs"], pings["y_obs"], c="#d73027", s=28, zorder=5, label="Hourly pings")
    # last uncertainty circle
    last = track.iloc[-1]
    circ = plt.Circle(
        (last["x_est"], last["y_est"]),
        last["uncertainty_radius_m"],
        fill=False,
        color="#d73027",
        ls="--",
        label="Final uncertainty",
    )
    ax.add_patch(circ)
    ax.set_aspect("equal")
    ax.set_xlabel("Easting (EPSG:5234)")
    ax.set_ylabel("Northing (EPSG:5234)")
    ax.set_title("Simulated elephant path + sparse EKF tracker")
    ax.legend(loc="best")
    plt.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def export_playback(
    track: pd.DataFrame,
    pings: pd.DataFrame,
    metrics: dict,
    start_cell_id: str | None = None,
) -> dict:
    """Build playback JSON payload for frontend."""
    frames = []
    for r in track.itertuples(index=False):
        frames.append(
            {
                "t_hours": float(r.t_hours),
                "x_true": float(r.x_true),
                "y_true": float(r.y_true),
                "x_est": float(r.x_est),
                "y_est": float(r.y_est),
                "uncertainty_radius_m": float(r.uncertainty_radius_m),
                "error_m": float(r.error_m),
                "alert": int(r.alert),
                "ping_update": int(r.ping_update),
            }
        )
    payload = {
        "crs": "EPSG:5234",
        "disclaimer": (
            "Simulated elephant path for research demo. "
            "Not live DWC tracking. Movement stats from Movebank-fitted Kruger GPS."
        ),
        "start_cell_id": start_cell_id,
        "metrics": metrics,
        "pings": [
            {
                "t_hours": float(r.t_hours),
                "x_obs": float(r.x_obs),
                "y_obs": float(r.y_obs),
            }
            for r in pings.itertuples(index=False)
        ],
        "frames": frames,
    }
    return payload


build_playback_payload = export_playback


def write_playback(track: pd.DataFrame, pings: pd.DataFrame, metrics: dict) -> None:
    payload = export_playback(track, pings, metrics)
    out = OUTPUTS_TRACKS / "playback.json"
    out.write_text(json.dumps(payload), encoding="utf-8")
    print(f"Saved {out}")


def main() -> None:
    OUTPUTS_REPORTS.mkdir(parents=True, exist_ok=True)
    OUTPUTS_MAPS.mkdir(parents=True, exist_ok=True)
    track = pd.read_parquet(OUTPUTS_TRACKS / "ekf_track.parquet")
    pings = pd.read_parquet(OUTPUTS_TRACKS / "hourly_pings.parquet")
    metrics = evaluate(track)
    (OUTPUTS_REPORTS / "tracker_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )
    plot_error_over_time(track, OUTPUTS_REPORTS / "error_vs_uncertainty.png")
    plot_path_map(track, pings, OUTPUTS_MAPS / "path_and_ekf.png")
    write_playback(track, pings, metrics)

    md = [
        "# Component 2 — tracker evaluation",
        "",
        "**Simulated path** · hourly sparse pings · constant-velocity EKF",
        "",
        "| Metric | Value |",
        "|---|---:|",
        f"| Mean error (m) | {metrics['mean_error_m']:.1f} |",
        f"| Median error (m) | {metrics['median_error_m']:.1f} |",
        f"| P90 error (m) | {metrics['p90_error_m']:.1f} |",
        f"| Mean error 15–30 min after ping | {metrics['mean_error_15_30_min']:.1f} |",
        f"| Mean error 30–45 min after ping | {metrics['mean_error_30_45_min']:.1f} |",
        f"| Mean error 45–60 min after ping | {metrics['mean_error_45_60_min']:.1f} |",
        f"| Truth inside 2σ circle (%) | {metrics['calibration_truth_inside_circle_pct']:.1f} |",
        f"| Alert steps (%) | {metrics['alert_pct']:.1f} |",
        "",
        "Figures: `error_vs_uncertainty.png`, `../maps/path_and_ekf.png`.",
        "",
        "Playback for UI: `../tracks/playback.json` (disclose: simulation).",
        "",
    ]
    (OUTPUTS_REPORTS / "evaluation_report.md").write_text("\n".join(md), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print("Evaluation complete.")


if __name__ == "__main__":
    main()
