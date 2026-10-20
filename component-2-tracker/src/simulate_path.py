"""
Habitat-constrained elephant path simulator on Anuradhapura (Component 1 grid).

Synthetic trajectory — labelled as research simulation, not a real herd.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    COMP1_FEATURE_GRID,
    COMP1_HANDOFF_RISK,
    DATA_PROCESSED,
    MOVEMENT_PARAMS_PATH,
    OUTPUTS_TRACKS,
    SIM_DT_MINUTES,
    SIM_DURATION_HOURS,
    SIM_SEED,
)


def load_movement_params() -> dict:
    return json.loads(MOVEMENT_PARAMS_PATH.read_text(encoding="utf-8"))


def load_landscape() -> pd.DataFrame:
    if not COMP1_FEATURE_GRID.exists():
        raise FileNotFoundError(f"Missing Comp-1 feature grid: {COMP1_FEATURE_GRID}")
    grid = pd.read_parquet(COMP1_FEATURE_GRID)
    if COMP1_HANDOFF_RISK.exists():
        risk = pd.read_parquet(COMP1_HANDOFF_RISK)[
            ["cell_id", "risk_score", "habitat_suitability", "human_exposure"]
        ]
        grid = grid.merge(risk, on="cell_id", how="left")
    else:
        grid["habitat_suitability"] = grid.get("frac_tree", 0.5)
        grid["risk_score"] = 0.0
        grid["human_exposure"] = grid.get("frac_built", 0) * 0.5 + grid.get("frac_crop", 0) * 0.5

    for c in ["habitat_suitability", "frac_tree", "frac_water", "frac_built", "frac_crop",
              "dist_water_m", "dist_settlement_m", "pop_density_approx", "risk_score"]:
        if c not in grid.columns:
            grid[c] = 0.0
        grid[c] = pd.to_numeric(grid[c], errors="coerce")
    grid = grid.dropna(subset=["cx", "cy"]).reset_index(drop=True)
    return grid


def _attractiveness(row: pd.Series) -> float:
    """Higher = more preferred for simulated elephant (habitat + farm-edge pull)."""
    hab = float(row.get("habitat_suitability", 0) or 0)
    tree = float(row.get("frac_tree", 0) or 0)
    water = float(row.get("frac_water", 0) or 0)
    crop = float(row.get("frac_crop", 0) or 0)
    dist_w = float(row.get("dist_water_m", 5000) or 5000)
    dist_s = float(row.get("dist_settlement_m", 5000) or 5000)
    built = float(row.get("frac_built", 0) or 0)
    pop = float(row.get("pop_density_approx", 0) or 0)
    # Prefer habitat/tree/water; mild pull toward crop edges (HEC zones);
    # still avoid dense built-up cores.
    edge = crop * max(tree, 0.15)
    near_people = np.exp(-dist_s / 2500.0)  # soft attraction toward periphery
    score = (
        1.3 * hab
        + 0.7 * tree
        + 0.5 * water
        + 0.9 * edge
        + 0.35 * near_people
        + 0.35 * np.exp(-dist_w / 1500.0)
        - 2.5 * built
        - 0.0015 * min(pop, 500)
    )
    return float(max(score, 1e-6))


def build_spatial_index(grid: pd.DataFrame) -> dict:
    """Map (ix, iy) -> row index; also store coords arrays."""
    key_to_i = {(int(ix), int(iy)): i for i, (ix, iy) in enumerate(zip(grid["ix"], grid["iy"]))}
    return {
        "key_to_i": key_to_i,
        "cx": grid["cx"].to_numpy(dtype=float),
        "cy": grid["cy"].to_numpy(dtype=float),
        "attr": grid.apply(_attractiveness, axis=1).to_numpy(dtype=float),
        "cell_id": grid["cell_id"].to_numpy(),
        "risk": grid["risk_score"].to_numpy(dtype=float),
        "dist_settle": grid["dist_settlement_m"].to_numpy(dtype=float),
    }


def nearest_cell(x: float, y: float, idx: dict, grid: pd.DataFrame) -> int:
    d2 = (idx["cx"] - x) ** 2 + (idx["cy"] - y) ** 2
    return int(np.argmin(d2))


def choose_start(grid: pd.DataFrame, rng: np.random.Generator) -> tuple[float, float, int]:
    """Start near habitat–crop edge (conflict-relevant), not deep wilderness only."""
    score = (
        grid["habitat_suitability"].fillna(0) * 1.5
        + grid["frac_tree"].fillna(0)
        + grid["frac_crop"].fillna(0) * grid["frac_tree"].fillna(0) * 2
        - 3 * grid["frac_built"].fillna(0)
    )
    thr = score.quantile(0.90)
    cand = grid[score >= thr]
    if cand.empty:
        cand = grid
    row = cand.sample(1, random_state=int(rng.integers(0, 1_000_000))).iloc[0]
    return float(row["cx"]), float(row["cy"]), int(row.name)


def resolve_start(
    grid: pd.DataFrame,
    rng: np.random.Generator,
    start_cell_id: str | None = None,
    start_xy: tuple[float, float] | None = None,
) -> tuple[float, float, int]:
    """Fixed start from Comp-1 cell click, or random default."""
    if start_cell_id is not None:
        match = grid.index[grid["cell_id"] == start_cell_id]
        if len(match) == 0:
            raise ValueError(f"Unknown start cell_id: {start_cell_id}")
        i = int(match[0])
        row = grid.loc[i]
        return float(row["cx"]), float(row["cy"]), i
    if start_xy is not None:
        x, y = start_xy
        i = int(np.argmin((grid["cx"] - x) ** 2 + (grid["cy"] - y) ** 2))
        row = grid.iloc[i]
        return float(row["cx"]), float(row["cy"]), i
    return choose_start(grid, rng)


def simulate_path(
    duration_hours: float = SIM_DURATION_HOURS,
    dt_minutes: float = SIM_DT_MINUTES,
    seed: int = SIM_SEED,
    start_cell_id: str | None = None,
    start_xy: tuple[float, float] | None = None,
) -> pd.DataFrame:
    params = load_movement_params()
    grid = load_landscape()
    idx = build_spatial_index(grid)
    rng = np.random.default_rng(seed)

    x, y, _ = resolve_start(grid, rng, start_cell_id=start_cell_id, start_xy=start_xy)
    heading = float(rng.uniform(0, 2 * np.pi))

    dt_s = dt_minutes * 60.0
    n_steps = int(duration_hours * 60 / dt_minutes) + 1
    mean_v = float(params["mean_speed_m_s"])
    std_v = float(params["speed_std_m_s"])
    vmin = float(params["min_speed_m_s"])
    vmax = float(params["max_speed_m_s"])
    kappa = float(params["turning_kappa"])
    p_rest = float(params["rest_probability"])

    records = []
    t_min = 0.0
    for step in range(n_steps):
        i_cell = nearest_cell(x, y, idx, grid)
        records.append(
            {
                "step": step,
                "t_minutes": t_min,
                "t_hours": t_min / 60.0,
                "x": x,
                "y": y,
                "heading_rad": heading,
                "cell_id": idx["cell_id"][i_cell],
                "attractiveness": idx["attr"][i_cell],
                "risk_score": idx["risk"][i_cell],
                "dist_settlement_m": idx["dist_settle"][i_cell],
                "is_true": 1,
            }
        )

        if step == n_steps - 1:
            break

        if rng.random() < p_rest:
            speed = 0.0
        else:
            speed = float(np.clip(rng.normal(mean_v, std_v), vmin, vmax))

        # von Mises-ish turn: approx with normal on heading for simplicity
        heading = heading + float(rng.normal(0, 1.0 / max(kappa, 0.5)))
        heading = (heading + np.pi) % (2 * np.pi) - np.pi

        # Propose several candidate headings; pick by landscape attractiveness
        candidates = []
        for dhead in (0.0, 0.4, -0.4, 0.9, -0.9, 1.5, -1.5):
            h = heading + dhead
            nx = x + speed * dt_s * np.cos(h)
            ny = y + speed * dt_s * np.sin(h)
            j = nearest_cell(nx, ny, idx, grid)
            candidates.append((idx["attr"][j], h, nx, ny, j))
        # Softmax-ish weights
        attrs = np.array([c[0] for c in candidates], dtype=float)
        attrs = attrs - attrs.max()
        w = np.exp(attrs)
        w = w / w.sum()
        pick = int(rng.choice(len(candidates), p=w))
        _, heading, x, y, _ = candidates[pick]
        # Keep inside available cells (already snapped via nearest)
        t_min += dt_minutes

    path = pd.DataFrame(records)
    return path


def main() -> None:
    OUTPUTS_TRACKS.mkdir(parents=True, exist_ok=True)
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    print("=== Simulate habitat-constrained path ===")
    path = simulate_path()
    out = OUTPUTS_TRACKS / "true_path.parquet"
    path.to_parquet(out, index=False)
    path.to_csv(OUTPUTS_TRACKS / "true_path.csv", index=False)
    print(f"Steps: {len(path)}  duration_h: {path['t_hours'].iloc[-1]:.1f}")
    print(f"Start cell: {path.iloc[0]['cell_id']}  End: {path.iloc[-1]['cell_id']}")
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
