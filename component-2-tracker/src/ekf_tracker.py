"""
Extended Kalman Filter (constant-velocity) for sparse GPS pings,
with optional Comp-1 habitat-biased prediction.

State: [x, y, vx, vy] in metres / m/s (EPSG:5234).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    ALERT_DIST_SETTLEMENT_M,
    ALERT_RISK_THRESHOLD,
    COMP1_FEATURE_GRID,
    COMP1_HANDOFF_RISK,
    EKF_MEAS_VAR,
    HABITAT_BIAS_RADIUS_M,
    HABITAT_BIAS_STRENGTH,
    MOVEMENT_PARAMS_PATH,
    OUTPUTS_TRACKS,
    SIM_DT_MINUTES,
)

# Continuous white-noise acceleration intensity (m^2/s^3)
ACCEL_PSD = 1e-4
MAX_SPEED_M_S = 1.5


def _load_max_speed() -> float:
    if MOVEMENT_PARAMS_PATH.exists():
        p = json.loads(MOVEMENT_PARAMS_PATH.read_text(encoding="utf-8"))
        return float(min(MAX_SPEED_M_S, max(0.5, p.get("max_speed_m_s", MAX_SPEED_M_S))))
    return MAX_SPEED_M_S


class ConstantVelocityEKF:
    def __init__(self, meas_var: float = EKF_MEAS_VAR, q: float = ACCEL_PSD):
        self.R = np.eye(2) * meas_var
        self.q = q
        self.max_speed = _load_max_speed()
        self.x: np.ndarray | None = None
        self.P: np.ndarray | None = None

    def initialize(self, x: float, y: float) -> None:
        self.x = np.array([x, y, 0.0, 0.0], dtype=float)
        m = float(self.R[0, 0])
        self.P = np.diag([m, m, 0.2**2, 0.2**2])

    def _F(self, dt: float) -> np.ndarray:
        F = np.eye(4)
        F[0, 2] = dt
        F[1, 3] = dt
        return F

    def _Q(self, dt: float) -> np.ndarray:
        q = self.q
        dt2 = dt * dt
        dt3 = dt2 * dt
        q11 = q * dt3 / 3.0
        q13 = q * dt2 / 2.0
        q33 = q * dt
        Q = np.zeros((4, 4))
        Q[0, 0] = Q[1, 1] = q11
        Q[2, 2] = Q[3, 3] = q33
        Q[0, 2] = Q[2, 0] = q13
        Q[1, 3] = Q[3, 1] = q13
        return Q

    def predict(self, dt: float) -> None:
        assert self.x is not None and self.P is not None
        F = self._F(dt)
        self.x = F @ self.x
        speed = float(np.hypot(self.x[2], self.x[3]))
        if speed > self.max_speed:
            self.x[2] *= self.max_speed / speed
            self.x[3] *= self.max_speed / speed
        self.P = F @ self.P @ F.T + self._Q(dt)

    def update(self, zx: float, zy: float) -> None:
        assert self.x is not None and self.P is not None
        H = np.array([[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]])
        z = np.array([zx, zy])
        y = z - H @ self.x
        S = H @ self.P @ H.T + self.R
        K = self.P @ H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        I = np.eye(4)
        self.P = (I - K @ H) @ self.P

    def uncertainty_radius_m(
        self,
        n_sigma: float = 2.0,
        minutes_since_ping: float = 0.0,
    ) -> float:
        assert self.P is not None
        eig = np.linalg.eigvalsh(self.P[:2, :2])
        cov_r = float(n_sigma * np.sqrt(max(eig.max(), 1e-6)))
        phys = 40.0 + self.max_speed * (minutes_since_ping * 60.0)
        return float(min(cov_r, phys))


def _attractiveness_row(row: pd.Series) -> float:
    hab = float(row.get("habitat_suitability", 0) or 0)
    tree = float(row.get("frac_tree", 0) or 0)
    water = float(row.get("frac_water", 0) or 0)
    crop = float(row.get("frac_crop", 0) or 0)
    built = float(row.get("frac_built", 0) or 0)
    return float(max(1.2 * hab + 0.7 * tree + 0.4 * water + 0.5 * crop * tree - 2.0 * built, 1e-6))


def load_habitat_field(risk_overlay: pd.DataFrame | None = None) -> dict:
    """Comp-1 cells used to bias the EKF predict step."""
    cols = ["cell_id", "cx", "cy", "frac_tree", "frac_water", "frac_built", "frac_crop"]
    grid = pd.read_parquet(COMP1_FEATURE_GRID)
    keep = [c for c in cols if c in grid.columns]
    grid = grid[keep].copy()
    if risk_overlay is not None and "habitat_suitability" in risk_overlay.columns:
        hab = risk_overlay[["cell_id", "habitat_suitability"]].drop_duplicates("cell_id")
        grid = grid.merge(hab, on="cell_id", how="left")
    elif COMP1_HANDOFF_RISK.exists():
        risk = pd.read_parquet(COMP1_HANDOFF_RISK)[["cell_id", "habitat_suitability"]]
        grid = grid.merge(risk, on="cell_id", how="left")
    if "habitat_suitability" not in grid.columns:
        grid["habitat_suitability"] = grid.get("frac_tree", 0.5)
    for c in ["habitat_suitability", "frac_tree", "frac_water", "frac_built", "frac_crop"]:
        if c not in grid.columns:
            grid[c] = 0.0
        grid[c] = pd.to_numeric(grid[c], errors="coerce").fillna(0.0)
    attr = grid.apply(_attractiveness_row, axis=1).to_numpy(dtype=float)
    return {
        "cx": grid["cx"].to_numpy(dtype=float),
        "cy": grid["cy"].to_numpy(dtype=float),
        "attr": attr,
    }


def apply_habitat_bias(
    ekf: ConstantVelocityEKF,
    field: dict,
    strength: float = HABITAT_BIAS_STRENGTH,
    radius_m: float = HABITAT_BIAS_RADIUS_M,
) -> None:
    """
    Soft pull of predicted velocity toward higher Comp-1 attractiveness.
    Makes the tracker respond to landscape inputs (not pure CV coasting).
    """
    if strength <= 0 or ekf.x is None:
        return
    x, y = float(ekf.x[0]), float(ekf.x[1])
    dx = field["cx"] - x
    dy = field["cy"] - y
    d2 = dx * dx + dy * dy
    mask = d2 <= (radius_m * radius_m)
    if not np.any(mask):
        # fall back to nearest ~40 cells
        idx = np.argpartition(d2, min(40, len(d2) - 1))[:40]
    else:
        idx = np.flatnonzero(mask)
    w = field["attr"][idx]
    w = w - w.max()
    w = np.exp(w)
    w = w / (w.sum() + 1e-12)
    tx = float(np.sum(w * field["cx"][idx]))
    ty = float(np.sum(w * field["cy"][idx]))
    pref = np.array([tx - x, ty - y], dtype=float)
    n = float(np.hypot(pref[0], pref[1]))
    if n < 1.0:
        return
    pref = pref / n
    speed = float(np.hypot(ekf.x[2], ekf.x[3]))
    if speed < 0.05:
        speed = 0.15  # mild nudge even when nearly stopped
    v_pref = pref * speed
    ekf.x[2] = (1.0 - strength) * ekf.x[2] + strength * v_pref[0]
    ekf.x[3] = (1.0 - strength) * ekf.x[3] + strength * v_pref[1]


def load_alert_cells(risk_overlay: pd.DataFrame | None = None) -> pd.DataFrame:
    grid = pd.read_parquet(COMP1_FEATURE_GRID)[["cell_id", "cx", "cy", "dist_settlement_m"]]
    if risk_overlay is not None and "risk_score" in risk_overlay.columns:
        risk = risk_overlay[["cell_id", "risk_score"]].drop_duplicates("cell_id")
        grid = grid.merge(risk, on="cell_id", how="left")
    elif COMP1_HANDOFF_RISK.exists():
        risk = pd.read_parquet(COMP1_HANDOFF_RISK)[["cell_id", "risk_score"]]
        grid = grid.merge(risk, on="cell_id", how="left")
    else:
        grid["risk_score"] = 0.0
    grid["risk_score"] = pd.to_numeric(grid["risk_score"], errors="coerce").fillna(0.0)
    grid["dist_settlement_m"] = pd.to_numeric(grid["dist_settlement_m"], errors="coerce")
    hot = grid[
        (grid["risk_score"] >= ALERT_RISK_THRESHOLD)
        | (grid["dist_settlement_m"] <= ALERT_DIST_SETTLEMENT_M)
    ].copy()
    return hot.reset_index(drop=True)


def circle_hits_hot(
    x: float,
    y: float,
    radius: float,
    hot: pd.DataFrame,
    max_check: int = 8000,
) -> bool:
    if hot.empty or radius <= 0:
        return False
    dx = (hot["cx"] - x).to_numpy(dtype=float)
    dy = (hot["cy"] - y).to_numpy(dtype=float)
    if len(hot) > max_check:
        rough = np.maximum(np.abs(dx), np.abs(dy))
        keep = np.argpartition(rough, max_check)[:max_check]
        dx, dy = dx[keep], dy[keep]
    d = np.hypot(dx, dy)
    return bool(np.any(d <= radius + 250.0))


def run_tracker(
    true_path: pd.DataFrame,
    pings: pd.DataFrame,
    dt_minutes: float = SIM_DT_MINUTES,
    risk_overlay: pd.DataFrame | None = None,
) -> pd.DataFrame:
    ekf = ConstantVelocityEKF()
    ping_times = set(np.round(pings["t_minutes"].to_numpy(), 6))
    ping_by_t = {
        round(float(r.t_minutes), 6): r for r in pings.itertuples(index=False)
    }
    hot = load_alert_cells(risk_overlay=risk_overlay)
    habitat = load_habitat_field(risk_overlay=risk_overlay)
    print(f"Alert landscape cells: {len(hot)}")
    print(f"Habitat bias strength: {HABITAT_BIAS_STRENGTH}")

    first = pings.iloc[0]
    ekf.initialize(float(first.x_obs), float(first.y_obs))

    dt_s = dt_minutes * 60.0
    rows = []
    prev_t = None
    last_ping_t = float(first.t_minutes)
    for r in true_path.itertuples(index=False):
        t = float(r.t_minutes)
        if prev_t is not None:
            ekf.predict(dt_s)
            apply_habitat_bias(ekf, habitat)
        key = round(t, 6)
        updated = False
        if key in ping_times:
            p = ping_by_t[key]
            ekf.update(float(p.x_obs), float(p.y_obs))
            updated = True
            last_ping_t = t

        minutes_since = t - last_ping_t
        radius = ekf.uncertainty_radius_m(2.0, minutes_since_ping=minutes_since)
        ex, ey = float(ekf.x[0]), float(ekf.x[1])
        err = float(np.hypot(ex - r.x, ey - r.y))
        inside = err <= radius
        risk = float(r.risk_score)
        dist_s = float(getattr(r, "dist_settlement_m", np.nan))
        alert = circle_hits_hot(ex, ey, radius, hot)

        rows.append(
            {
                "step": int(r.step),
                "t_minutes": t,
                "t_hours": float(r.t_hours),
                "x_true": float(r.x),
                "y_true": float(r.y),
                "x_est": ex,
                "y_est": ey,
                "vx_est": float(ekf.x[2]),
                "vy_est": float(ekf.x[3]),
                "uncertainty_radius_m": radius,
                "error_m": err,
                "truth_inside_circle": int(inside),
                "ping_update": int(updated),
                "minutes_since_ping": minutes_since,
                "cell_id": r.cell_id,
                "risk_score": risk,
                "dist_settlement_m": dist_s,
                "alert": int(alert),
            }
        )
        prev_t = t

    return pd.DataFrame(rows)


def main() -> None:
    true_path = pd.read_parquet(OUTPUTS_TRACKS / "true_path.parquet")
    pings = pd.read_parquet(OUTPUTS_TRACKS / "hourly_pings.parquet")
    print("=== EKF tracker (habitat-biased) ===")
    track = run_tracker(true_path, pings)
    out = OUTPUTS_TRACKS / "ekf_track.parquet"
    track.to_parquet(out, index=False)
    track.to_csv(OUTPUTS_TRACKS / "ekf_track.csv", index=False)
    print(f"Saved {out} ({len(track)} steps)")
    print(
        f"Mean error: {track['error_m'].mean():.1f} m  |  "
        f"truth inside 2-sigma: {100 * track['truth_inside_circle'].mean():.1f}%  |  "
        f"median radius: {track['uncertainty_radius_m'].median():.0f} m  |  "
        f"alert: {100 * track['alert'].mean():.1f}%"
    )


if __name__ == "__main__":
    main()
