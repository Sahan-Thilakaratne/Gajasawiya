"""
Phase 5 — plain-English explanations for risk cells.

Novelty: not only a red/green score, but *why* a cell is risky
(e.g. "farm + village + forest edge").

Outputs:
  outputs/maps/risk_explanations.json   (keyed by cell_id)
  outputs/maps/risk_with_explanations.parquet / .csv
  outputs/reports/phase5_example_explanations.md
  outputs/reports/phase5_label_counts.csv
  outputs/reports/global_importance_phase5.png  (from Phase 4 importances)
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import DATA_PROCESSED, OUTPUTS_MAPS, OUTPUTS_REPORTS, PROJECT_ROOT

# How many high-risk cells get detailed SHAP-style local notes
N_DETAILED = 50
# Risk percentile for "high" examples
HIGH_RISK_PCT = 90


def load_tables() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    grid = pd.read_parquet(DATA_PROCESSED / "feature_grid.parquet")
    risk = pd.read_parquet(OUTPUTS_MAPS / "risk_scores.parquet")
    bundle = joblib.load(PROJECT_ROOT / "outputs" / "xgb_habitat_model.joblib")
    return grid, risk, bundle


def rule_tags(row: pd.Series) -> list[str]:
    """Human-readable factor tags from cell features + exposure."""
    tags: list[str] = []

    if int(row.get("forest_edge", 0) or 0) == 1:
        tags.append("forest edge")
    if float(row.get("frac_crop", 0) or 0) >= 0.15:
        tags.append("farm")
    if float(row.get("frac_built", 0) or 0) >= 0.05:
        tags.append("built-up")
    if float(row.get("dist_settlement_m", 1e9) or 1e9) <= 1000:
        tags.append("village nearby")
    if float(row.get("dist_water_m", 1e9) or 1e9) <= 500:
        tags.append("near water")
    if float(row.get("frac_tree", 0) or 0) >= 0.4:
        tags.append("tree cover")
    if int(row.get("protected", 0) or 0) == 1:
        tags.append("protected area")
    if float(row.get("human_exposure", 0) or 0) >= 0.4:
        tags.append("people / crops present")
    if float(row.get("habitat_suitability", 0) or 0) >= 0.5:
        tags.append("elephant habitat likely")

    # Prefer short distinctive set
    # Deduplicate while preserving order
    seen = set()
    out = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def explanation_phrase(tags: list[str], risk: float) -> str:
    if not tags:
        if risk >= 0.3:
            return "mixed habitat and human use (no single dominant tag)"
        return "lower overlap of elephants and people"
    # Classic novelty phrase when farm + village + edge co-occur
    core = set(tags)
    if {"farm", "village nearby", "forest edge"}.issubset(core) or {
        "farm",
        "built-up",
        "forest edge",
    }.issubset(core):
        return "farm + village + forest edge"
    if {"farm", "forest edge"}.issubset(core):
        return "farm + forest edge"
    if {"village nearby", "forest edge"}.issubset(core):
        return "village + forest edge"
    if {"near water", "farm"}.issubset(core):
        return "farm near water"
    if {"protected area", "farm"}.issubset(core) or {
        "protected area",
        "village nearby",
    }.issubset(core):
        return "settlement / farm next to protected area"
    return " + ".join(tags[:4])


def why_sentence(row: pd.Series, tags: list[str]) -> str:
    """One-sentence examiner/villager explanation."""
    phrase = explanation_phrase(tags, float(row.get("risk_score", 0) or 0))
    h = float(row.get("habitat_suitability", 0) or 0)
    e = float(row.get("human_exposure", 0) or 0)
    r = float(row.get("risk_score", 0) or 0)
    return (
        f"Risk is elevated here because of {phrase}. "
        f"Elephant habitat suitability ≈ {h:.2f} and human exposure ≈ {e:.2f} "
        f"(overlap risk ≈ {r:.2f})."
    )


def local_factor_bullets(row: pd.Series, medians: pd.Series) -> list[str]:
    """Compare key features to district medians for local 'why'."""
    bullets = []
    checks = [
        ("frac_crop", "cropland fraction", True),
        ("frac_built", "built-up fraction", True),
        ("frac_tree", "tree cover", True),
        ("pop_density_approx", "population density", True),
        ("dist_settlement_m", "distance to settlement", False),  # lower = more people
        ("dist_water_m", "distance to water", False),
        ("dist_road_m", "distance to road", False),
        ("elevation_m", "elevation", True),
    ]
    for col, label, higher_riskier in checks:
        if col not in row.index or col not in medians.index:
            continue
        val = row[col]
        med = medians[col]
        if pd.isna(val) or pd.isna(med):
            continue
        if higher_riskier and val > med * 1.25 and val > 0:
            bullets.append(f"{label} higher than typical ({val:.2f} vs median {med:.2f})")
        if not higher_riskier and val < med * 0.75:
            bullets.append(f"{label} closer than typical ({val:.0f} m vs median {med:.0f} m)")
    if int(row.get("forest_edge", 0) or 0) == 1:
        bullets.append("cell sits on a forest–farm / forest–settlement edge")
    if int(row.get("protected", 0) or 0) == 1:
        bullets.append("inside or overlapping a protected-area polygon")
    return bullets[:5]


def shap_top_for_rows(
    model, feature_cols: list[str], X: pd.DataFrame
) -> dict[str, list[dict]]:
    """SHAP top drivers for each row in X; empty dict if shap unavailable."""
    try:
        import shap
    except ImportError:
        print("  shap not installed — skipping local SHAP (rule labels still OK)")
        return {}
    try:
        explainer = shap.TreeExplainer(model)
        sv = explainer.shap_values(X)
        if isinstance(sv, list):
            sv = sv[1] if len(sv) > 1 else sv[0]
        sv = np.asarray(sv)
        out: dict[str, list[dict]] = {}
        for r in range(len(X)):
            vals = sv[r]
            order = np.argsort(np.abs(vals))[::-1][:5]
            # index may be cell_id if set
            key = str(X.index[r])
            out[key] = [
                {
                    "feature": feature_cols[i],
                    "shap": float(vals[i]),
                    "value": float(X.iloc[r, i]),
                }
                for i in order
            ]
        return out
    except Exception as err:  # noqa: BLE001
        print(f"  SHAP skipped: {err}")
        return {}


def plot_global_importance(imp_csv: Path, out_png: Path) -> None:
    if not imp_csv.exists():
        return
    imp = pd.read_csv(imp_csv, index_col=0).squeeze("columns")
    if isinstance(imp, pd.DataFrame):
        imp = imp.iloc[:, 0]
    imp = imp.sort_values(ascending=True)
    fig, ax = plt.subplots(figsize=(7, 5))
    imp.plot(kind="barh", ax=ax, color="#2f6f4e")
    ax.set_title("Global feature importance (habitat model)")
    ax.set_xlabel("Importance")
    plt.tight_layout()
    fig.savefig(out_png, dpi=150)
    plt.close(fig)


def main() -> None:
    OUTPUTS_MAPS.mkdir(parents=True, exist_ok=True)
    OUTPUTS_REPORTS.mkdir(parents=True, exist_ok=True)

    print("=== Phase 5: risk explanations ===")
    grid, risk, bundle = load_tables()
    feature_cols: list[str] = bundle["feature_cols"]
    model = bundle["model"]

    df = risk.merge(grid, on=["cell_id", "ix", "iy", "cx", "cy"], how="left")
    medians = df[feature_cols].median(numeric_only=True)

    plot_global_importance(
        OUTPUTS_REPORTS / "feature_importance.csv",
        OUTPUTS_REPORTS / "global_importance_phase5.png",
    )

    high_cut = float(df["risk_score"].quantile(HIGH_RISK_PCT / 100.0))
    top = df.nlargest(N_DETAILED, "risk_score").copy()
    high_ids = set(top["cell_id"].tolist())
    print(f"High-risk cutoff (p{HIGH_RISK_PCT}): {high_cut:.4f}")
    print(f"Detailed SHAP/local notes for top {len(high_ids)} cells")

    X_top = top.set_index("cell_id")[feature_cols]
    shap_map = shap_top_for_rows(model, feature_cols, X_top)

    explanations: dict[str, dict] = {}
    label_counter: Counter[str] = Counter()
    phrases = []
    tags_list = []
    why_list = []
    detail_list = []

    for _, row in df.iterrows():
        tags = rule_tags(row)
        phrase = explanation_phrase(tags, float(row["risk_score"]))
        why = why_sentence(row, tags)
        phrases.append(phrase)
        tags_list.append("|".join(tags))
        why_list.append(why)
        label_counter[phrase] += 1

        entry = {
            "cell_id": row["cell_id"],
            "risk_score": float(row["risk_score"]),
            "risk_score_0_100": float(row.get("risk_score_0_100", np.nan)),
            "habitat_suitability": float(row["habitat_suitability"]),
            "human_exposure": float(row["human_exposure"]),
            "tags": tags,
            "explanation": phrase,
            "why": why,
        }

        if row["cell_id"] in high_ids:
            entry["local_factors"] = local_factor_bullets(row, medians)
            entry["shap_top"] = shap_map.get(str(row["cell_id"]), [])
            detail_list.append(entry)

        explanations[row["cell_id"]] = entry

    # Keep detail_list ordered by risk
    detail_list.sort(key=lambda e: e["risk_score"], reverse=True)

    df["explanation"] = phrases
    df["tags"] = tags_list
    df["why"] = why_list

    slim = {
        cid: {
            "risk_score": v["risk_score"],
            "explanation": v["explanation"],
            "tags": v["tags"],
            "why": v["why"],
            **(
                {
                    "local_factors": v["local_factors"],
                    "shap_top": v["shap_top"],
                }
                if "local_factors" in v
                else {}
            ),
        }
        for cid, v in explanations.items()
    }

    json_path = OUTPUTS_MAPS / "risk_explanations.json"
    json_path.write_text(json.dumps(slim, indent=2), encoding="utf-8")

    keep_cols = [
        "cell_id",
        "ix",
        "iy",
        "cx",
        "cy",
        "habitat_suitability",
        "human_exposure",
        "risk_score",
        "risk_score_0_100",
        "explanation",
        "tags",
        "why",
        "forest_edge",
        "frac_crop",
        "frac_built",
        "frac_tree",
        "protected",
        "dist_settlement_m",
        "dist_water_m",
    ]
    keep_cols = [c for c in keep_cols if c in df.columns]
    out_df = df[keep_cols].copy()
    parquet_path = OUTPUTS_MAPS / "risk_with_explanations.parquet"
    csv_path = OUTPUTS_MAPS / "risk_with_explanations.csv"
    out_df.to_parquet(parquet_path, index=False)
    out_df.to_csv(csv_path, index=False)

    counts = (
        pd.DataFrame(
            {"explanation": list(label_counter.keys()), "n_cells": list(label_counter.values())}
        ).sort_values("n_cells", ascending=False)
    )
    counts.to_csv(OUTPUTS_REPORTS / "phase5_label_counts.csv", index=False)

    lines = [
        "# Phase 5 — Why is this place risky?",
        "",
        "Conflict risk is **not** “there is forest.” It is where elephant habitat and people overlap.",
        "",
        f"- District cells explained: **{len(df):,}**",
        f"- High-risk detailed examples: **{len(detail_list)}** (top by `risk_score`)",
        f"- High-risk percentile cutoff used for context: p{HIGH_RISK_PCT} ≈ **{high_cut:.3f}**",
        "",
        "## Most common explanation labels",
        "",
        "| Explanation | Cells |",
        "|---|---:|",
    ]
    for _, r in counts.head(12).iterrows():
        lines.append(f"| {r['explanation']} | {int(r['n_cells'])} |")

    lines += ["", "## Example high-risk cells", ""]
    for i, e in enumerate(detail_list[:8], start=1):
        lines.append(f"### Example {i}: `{e['cell_id']}`")
        lines.append("")
        lines.append(
            f"- **Risk score:** {e['risk_score']:.3f} "
            f"(0–100: {e.get('risk_score_0_100', float('nan')):.1f})"
        )
        lines.append(f"- **Label:** {e['explanation']}")
        lines.append(f"- **Why:** {e['why']}")
        if e.get("local_factors"):
            lines.append("- **Local factors:**")
            for b in e["local_factors"]:
                lines.append(f"  - {b}")
        if e.get("shap_top"):
            lines.append("- **Top SHAP drivers (habitat model):**")
            for s in e["shap_top"]:
                lines.append(
                    f"  - `{s['feature']}` = {s['value']:.3g} (SHAP {s['shap']:+.3f})"
                )
        lines.append("")

    lines += [
        "## How to cite this in the dissertation",
        "",
        "The map colours land by overlap risk. Lookup of a cell returns a short phrase",
        "(e.g. “farm + village + forest edge”) plus habitat and exposure scores,",
        "so examiners can see *why* a square is red — not only that it is red.",
        "",
    ]
    md_path = OUTPUTS_REPORTS / "phase5_example_explanations.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"Saved {json_path}")
    print(f"Saved {parquet_path}")
    print(f"Saved {csv_path}")
    print(f"Saved {md_path}")
    print("Top labels:")
    print(counts.head(8).to_string(index=False))
    print("Phase 5 complete.")


if __name__ == "__main__":
    main()
