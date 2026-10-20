"""
Phase 7 — validate the Anuradhapura overlap risk map (RQ1).

Checks:
  7.1 Spatial CV metrics (+ TSS at Youden threshold on OOF-style train predictions)
  7.2 Literature / known HEC pattern checklist (proxy spatial tests)
  7.3 Sanity: deep forest vs forest–farm edge
  7.4 Sensitivity: exposure with / without population

Outputs under outputs/reports/:
  phase7_validation_report.md
  phase7_metrics.json
  phase7_sanity_boxplot.png
  phase7_sensitivity_scatter.png
  phase7_cv_bars.png
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GroupKFold
from xgboost import XGBClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import DATA_PROCESSED, OUTPUTS_MAPS, OUTPUTS_REPORTS, PROJECT_ROOT


def tss_at_threshold(y_true: np.ndarray, y_score: np.ndarray, thr: float) -> float:
    y_pred = (y_score >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    sens = tp / (tp + fn) if (tp + fn) else 0.0
    spec = tn / (tn + fp) if (tn + fp) else 0.0
    return float(sens + spec - 1.0)


def youden_threshold(y_true: np.ndarray, y_score: np.ndarray) -> float:
    fpr, tpr, thr = roc_curve(y_true, y_score)
    j = tpr - fpr
    return float(thr[int(np.argmax(j))])


def make_model(spw: float) -> XGBClassifier:
    return XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="auc",
        scale_pos_weight=spw,
        random_state=42,
        n_jobs=-1,
    )


def spatial_cv_with_tss(train: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
    X = train[feature_cols]
    y = train["label"].astype(int).to_numpy()
    groups = (train["ix"] // 20).astype(str) + "_" + (train["iy"] // 20).astype(str)
    spw = float((y == 0).sum() / max((y == 1).sum(), 1))
    gkf = GroupKFold(n_splits=5)
    rows = []
    oof = np.zeros(len(y))
    for fold, (tr, te) in enumerate(gkf.split(X, y, groups), start=1):
        model = make_model(spw)
        model.fit(X.iloc[tr], y[tr])
        proba = model.predict_proba(X.iloc[te])[:, 1]
        oof[te] = proba
        thr = youden_threshold(y[te], proba)
        rows.append(
            {
                "fold": fold,
                "auc": float(roc_auc_score(y[te], proba)),
                "average_precision": float(average_precision_score(y[te], proba)),
                "tss_youden": tss_at_threshold(y[te], proba, thr),
                "threshold": thr,
                "n_test": int(len(te)),
            }
        )
    thr_oof = youden_threshold(y, oof)
    summary = {
        "oof_auc": float(roc_auc_score(y, oof)),
        "oof_ap": float(average_precision_score(y, oof)),
        "oof_tss_youden": tss_at_threshold(y, oof, thr_oof),
        "oof_threshold": thr_oof,
    }
    return pd.DataFrame(rows), summary, oof, y


def sanity_checks(df: pd.DataFrame) -> dict:
    """Deep forest far from people should be lower risk than forest edge."""
    deep = df[
        (df["frac_tree"] >= 0.7)
        & (df["forest_edge"] == 0)
        & (df["dist_settlement_m"] >= 3000)
        & (df["frac_crop"] < 0.05)
        & (df["frac_built"] < 0.02)
    ]
    edge = df[df["forest_edge"] == 1]
    farm_edge = df[(df["forest_edge"] == 1) & (df["frac_crop"] >= 0.15)]

    def stats(s: pd.Series) -> dict:
        return {
            "n": int(len(s)),
            "mean_risk": float(s.mean()) if len(s) else float("nan"),
            "median_risk": float(s.median()) if len(s) else float("nan"),
            "p90_risk": float(s.quantile(0.9)) if len(s) else float("nan"),
        }

    out = {
        "deep_interior_forest": stats(deep["risk_score"]),
        "all_forest_edge": stats(edge["risk_score"]),
        "farm_forest_edge": stats(farm_edge["risk_score"]),
    }
    out["pass_edge_gt_deep"] = bool(
        out["farm_forest_edge"]["mean_risk"] > out["deep_interior_forest"]["mean_risk"]
        and out["all_forest_edge"]["mean_risk"] > out["deep_interior_forest"]["mean_risk"]
    )
    # Protected interior vs edge near settlements
    prot_far = df[(df["protected"] == 1) & (df["dist_settlement_m"] >= 2500)]
    near_settle = df[df["dist_settlement_m"] <= 1000]
    out["protected_far_from_settlement"] = stats(prot_far["risk_score"])
    out["near_settlement"] = stats(near_settle["risk_score"])
    out["pass_settle_gt_prot_far"] = bool(
        out["near_settlement"]["mean_risk"] > out["protected_far_from_settlement"]["mean_risk"]
    )
    return out, deep, edge, farm_edge


def literature_proxy_checks(df: pd.DataFrame) -> dict:
    """
    Without digitised Fernando district tables, use open-data proxies that match
    the published HEC story: Dry Zone edges of parks / forest–farm mosaics.
    """
    # High-risk cells should be enriched for forest_edge and farms
    high = df[df["risk_score"] >= df["risk_score"].quantile(0.9)]
    rest = df[df["risk_score"] < df["risk_score"].quantile(0.9)]

    def rate(mask_col: str, subset: pd.DataFrame) -> float:
        return float(subset[mask_col].mean()) if len(subset) else float("nan")

    checks = {
        "n_high_risk_p90": int(len(high)),
        "forest_edge_rate_high": rate("forest_edge", high),
        "forest_edge_rate_rest": rate("forest_edge", rest),
        "mean_frac_crop_high": float(high["frac_crop"].mean()),
        "mean_frac_crop_rest": float(rest["frac_crop"].mean()),
        "mean_dist_settlement_high": float(high["dist_settlement_m"].mean()),
        "mean_dist_settlement_rest": float(rest["dist_settlement_m"].mean()),
        "protected_rate_high": rate("protected", high),
        "protected_rate_rest": rate("protected", rest),
    }
    checks["pass_edge_enriched"] = bool(
        checks["forest_edge_rate_high"] > checks["forest_edge_rate_rest"]
    )
    checks["pass_crop_enriched"] = bool(
        checks["mean_frac_crop_high"] > checks["mean_frac_crop_rest"]
    )
    checks["pass_closer_settlements"] = bool(
        checks["mean_dist_settlement_high"] < checks["mean_dist_settlement_rest"]
    )
    # Narrative for report (cited qualitatively)
    checks["literature_note"] = (
        "Published Sri Lankan HEC work (e.g. Fernando and co-authors) emphasises "
        "conflict at Dry Zone forest–agriculture interfaces and around protected-area "
        "edges, not in deep uninhabited forest. Anuradhapura lies in that Dry Zone "
        "pattern. This project does not re-digitise restricted incident coordinates; "
        "instead we test whether our open-data risk surface is enriched for the same "
        "structural setting (forest edge, cropland, nearer settlements)."
    )
    return checks


def sensitivity_without_population(df: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    """Rebuild exposure excluding population; compare risk maps."""
    frac_crop = df["frac_crop"].clip(0, 1).to_numpy(dtype=float)
    frac_built = df["frac_built"].clip(0, 1).to_numpy(dtype=float)
    pop = np.nan_to_num(df["pop_density_approx"].to_numpy(dtype=float), nan=0.0)
    q95 = float(np.nanpercentile(pop, 95)) if np.isfinite(pop).any() else 1.0
    pop_norm = np.clip(pop / (q95 + 1e-6), 0, 1)

    # With pop (same recipe as Phase 2/4 fix)
    exp_with = 0.4 * frac_crop + 0.4 * frac_built + 0.2 * pop_norm
    # Without pop — renormalise weights to crop+built only
    exp_without = 0.5 * frac_crop + 0.5 * frac_built

    def norm01(x: np.ndarray) -> np.ndarray:
        lo, hi = np.nanpercentile(x, [2, 98])
        return np.clip((x - lo) / (hi - lo + 1e-9), 0, 1)

    habitat = df["habitat_suitability"].to_numpy(dtype=float)
    risk_with = habitat * norm01(exp_with)
    risk_without = habitat * norm01(exp_without)

    cmp = pd.DataFrame(
        {
            "cell_id": df["cell_id"],
            "risk_with_pop": risk_with,
            "risk_without_pop": risk_without,
            "delta": risk_with - risk_without,
        }
    )
    spearman = float(cmp["risk_with_pop"].corr(cmp["risk_without_pop"], method="spearman"))
    # Rank change among top 10%
    top_with = set(cmp.nlargest(int(0.1 * len(cmp)), "risk_with_pop")["cell_id"])
    top_without = set(cmp.nlargest(int(0.1 * len(cmp)), "risk_without_pop")["cell_id"])
    jaccard = len(top_with & top_without) / max(len(top_with | top_without), 1)

    summary = {
        "spearman_risk": spearman,
        "top10_jaccard": float(jaccard),
        "mean_abs_delta": float(np.mean(np.abs(cmp["delta"]))),
        "mean_delta": float(np.mean(cmp["delta"])),
        "note": (
            "Removing population softens risk in dense villages but keeps farm/forest-edge "
            "structure via cropland and built-up. High Spearman / Jaccard ⇒ map is not "
            "driven by population alone."
        ),
    }
    return summary, cmp


def plot_cv_bars(cv: pd.DataFrame, out: Path) -> None:
    fig, ax = plt.subplots(figsize=(7, 4))
    x = cv["fold"]
    w = 0.35
    ax.bar(x - w / 2, cv["auc"], width=w, label="AUC", color="#2f6f4e")
    ax.bar(x + w / 2, cv["tss_youden"], width=w, label="TSS (Youden)", color="#d73027")
    ax.axhline(cv["auc"].mean(), color="#2f6f4e", ls="--", lw=1)
    ax.set_xlabel("Spatial fold")
    ax.set_ylabel("Score")
    ax.set_title("Phase 7 — spatial cross-validation")
    ax.set_xticks(list(x))
    ax.legend()
    ax.set_ylim(0, 1)
    plt.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def plot_sanity(deep: pd.DataFrame, edge: pd.DataFrame, farm_edge: pd.DataFrame, out: Path) -> None:
    data = [
        deep["risk_score"].to_numpy(),
        edge["risk_score"].to_numpy(),
        farm_edge["risk_score"].to_numpy(),
    ]
    labels = ["Deep forest\n(far from people)", "Forest edge\n(all)", "Farm +\nforest edge"]
    fig, ax = plt.subplots(figsize=(7, 4.5))
    bp = ax.boxplot(data, tick_labels=labels, patch_artist=True, showfliers=False)
    colors = ["#1a9850", "#fee08b", "#d73027"]
    for patch, c in zip(bp["boxes"], colors):
        patch.set_facecolor(c)
    ax.set_ylabel("risk_score")
    ax.set_title("Sanity check: deep forest vs conflict edges")
    plt.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def plot_sensitivity(cmp: pd.DataFrame, out: Path) -> None:
    sample = cmp.sample(n=min(4000, len(cmp)), random_state=42)
    fig, ax = plt.subplots(figsize=(5.5, 5.5))
    ax.scatter(
        sample["risk_without_pop"],
        sample["risk_with_pop"],
        s=4,
        alpha=0.35,
        c="#2f6f4e",
        linewidths=0,
    )
    lim = max(sample["risk_with_pop"].max(), sample["risk_without_pop"].max()) * 1.05
    ax.plot([0, lim], [0, lim], "--", color="grey", lw=1)
    ax.set_xlabel("Risk without population")
    ax.set_ylabel("Risk with population")
    ax.set_title("Sensitivity: population in human exposure")
    ax.set_aspect("equal")
    plt.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def main() -> None:
    print("=== Phase 7: validation ===")
    OUTPUTS_REPORTS.mkdir(parents=True, exist_ok=True)

    train = pd.read_parquet(DATA_PROCESSED / "training_set.parquet")
    risk = pd.read_parquet(OUTPUTS_MAPS / "risk_with_explanations.parquet")
    grid = pd.read_parquet(DATA_PROCESSED / "feature_grid.parquet")
    df = risk.merge(
        grid.drop(columns=[c for c in grid.columns if c in risk.columns and c != "cell_id"]),
        on="cell_id",
        how="left",
    )
    # ensure required cols
    for c in ["frac_tree", "frac_crop", "frac_built", "forest_edge", "dist_settlement_m", "protected", "pop_density_approx"]:
        if c not in df.columns:
            raise RuntimeError(f"Missing column {c}")

    bundle = joblib.load(PROJECT_ROOT / "outputs" / "xgb_habitat_model.joblib")
    feature_cols = bundle["feature_cols"]

    # 7.1
    print("7.1 Spatial CV + TSS...")
    cv, oof_sum, oof, y = spatial_cv_with_tss(train, feature_cols)
    cv.to_csv(OUTPUTS_REPORTS / "phase7_spatial_cv_tss.csv", index=False)
    plot_cv_bars(cv, OUTPUTS_REPORTS / "phase7_cv_bars.png")
    print(cv.to_string(index=False))
    print("OOF", oof_sum)

    # 7.3
    print("7.3 Sanity checks...")
    sanity, deep, edge, farm_edge = sanity_checks(df)
    plot_sanity(deep, edge, farm_edge, OUTPUTS_REPORTS / "phase7_sanity_boxplot.png")
    print("edge > deep?", sanity["pass_edge_gt_deep"])

    # 7.2
    print("7.2 Literature proxy checks...")
    lit = literature_proxy_checks(df)
    print(
        "edge enriched?",
        lit["pass_edge_enriched"],
        "crop enriched?",
        lit["pass_crop_enriched"],
        "closer settlements?",
        lit["pass_closer_settlements"],
    )

    # 7.4
    print("7.4 Sensitivity (drop population)...")
    sens, cmp = sensitivity_without_population(df)
    cmp.to_parquet(OUTPUTS_REPORTS / "phase7_sensitivity_risks.parquet", index=False)
    plot_sensitivity(cmp, OUTPUTS_REPORTS / "phase7_sensitivity_scatter.png")
    print("Spearman", round(sens["spearman_risk"], 3), "top10 Jaccard", round(sens["top10_jaccard"], 3))

    metrics = {
        "cv_folds": cv.to_dict(orient="records"),
        "cv_mean_auc": float(cv["auc"].mean()),
        "cv_std_auc": float(cv["auc"].std()),
        "cv_mean_tss": float(cv["tss_youden"].mean()),
        "oof": oof_sum,
        "sanity": sanity,
        "literature_proxy": lit,
        "sensitivity": sens,
        "overall_pass": bool(
            cv["auc"].mean() >= 0.75
            and sanity["pass_edge_gt_deep"]
            and lit["pass_edge_enriched"]
            and lit["pass_crop_enriched"]
            and sens["spearman_risk"] >= 0.7
        ),
    }
    (OUTPUTS_REPORTS / "phase7_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )

    # Report markdown
    lines = [
        "# Phase 7 — Validation report (RQ1)",
        "",
        f"**Overall pass:** {'YES' if metrics['overall_pass'] else 'PARTIAL / REVIEW'}",
        "",
        "## 7.1 Spatial cross-validation",
        "",
        "Habitat model trained with **GroupKFold** on ~10 km blocks (not random rows).",
        "",
        f"- Mean AUC: **{metrics['cv_mean_auc']:.3f} ± {metrics['cv_std_auc']:.3f}**",
        f"- Mean TSS (Youden): **{metrics['cv_mean_tss']:.3f}**",
        f"- OOF AUC: **{oof_sum['oof_auc']:.3f}** · OOF AP: **{oof_sum['oof_ap']:.3f}** · OOF TSS: **{oof_sum['oof_tss_youden']:.3f}**",
        "",
        "Per-fold table: `phase7_spatial_cv_tss.csv` · figure: `phase7_cv_bars.png`.",
        "",
        "| Fold | AUC | AP | TSS |",
        "|---:|---:|---:|---:|",
    ]
    for _, r in cv.iterrows():
        lines.append(
            f"| {int(r['fold'])} | {r['auc']:.3f} | {r['average_precision']:.3f} | {r['tss_youden']:.3f} |"
        )

    lines += [
        "",
        "## 7.2 Literature / known HEC pattern (proxy)",
        "",
        lit["literature_note"],
        "",
        "| Test | High-risk (p90) | Rest | Pass |",
        "|---|---:|---:|---|",
        f"| Forest-edge rate | {lit['forest_edge_rate_high']:.2%} | {lit['forest_edge_rate_rest']:.2%} | {lit['pass_edge_enriched']} |",
        f"| Mean cropland fraction | {lit['mean_frac_crop_high']:.3f} | {lit['mean_frac_crop_rest']:.3f} | {lit['pass_crop_enriched']} |",
        f"| Mean dist. to settlement (m) | {lit['mean_dist_settlement_high']:.0f} | {lit['mean_dist_settlement_rest']:.0f} | {lit['pass_closer_settlements']} |",
        "",
        "If official DS-division HEC intensity tables are added later, overlay them here as an extra check.",
        "",
        "## 7.3 Sanity checks",
        "",
        "Expectation: **deep interior forest far from people** has lower overlap risk than **forest–farm edges**.",
        "",
        f"| Class | n | mean risk | median | p90 |",
        f"|---|---:|---:|---:|---:|",
        f"| Deep interior forest | {sanity['deep_interior_forest']['n']} | {sanity['deep_interior_forest']['mean_risk']:.4f} | {sanity['deep_interior_forest']['median_risk']:.4f} | {sanity['deep_interior_forest']['p90_risk']:.4f} |",
        f"| Forest edge (all) | {sanity['all_forest_edge']['n']} | {sanity['all_forest_edge']['mean_risk']:.4f} | {sanity['all_forest_edge']['median_risk']:.4f} | {sanity['all_forest_edge']['p90_risk']:.4f} |",
        f"| Farm + forest edge | {sanity['farm_forest_edge']['n']} | {sanity['farm_forest_edge']['mean_risk']:.4f} | {sanity['farm_forest_edge']['median_risk']:.4f} | {sanity['farm_forest_edge']['p90_risk']:.4f} |",
        "",
        f"**Pass (edge > deep):** {sanity['pass_edge_gt_deep']}",
        f"**Pass (near settlement > protected far):** {sanity['pass_settle_gt_prot_far']}",
        "",
        "Figure: `phase7_sanity_boxplot.png`.",
        "",
        "## 7.4 Sensitivity — drop population from exposure",
        "",
        sens["note"],
        "",
        f"- Spearman correlation (with vs without pop): **{sens['spearman_risk']:.3f}**",
        f"- Top-10% hotspot Jaccard overlap: **{sens['top10_jaccard']:.3f}**",
        f"- Mean |Δ risk|: **{sens['mean_abs_delta']:.4f}**",
        "",
        "Figure: `phase7_sensitivity_scatter.png`.",
        "",
        "## Limitations (honest)",
        "",
        "- Occurrence data are citizen-science biased (Phase 3 note).",
        "- No restricted DWC incident GIS layer was used.",
        "- Literature agreement is **structural** (edge / farm / settlement), not cell-by-cell vs named herds.",
        "- AP is modest under 1:10 class imbalance; **AUC / TSS** are the primary ranking metrics.",
        "",
    ]
    report = OUTPUTS_REPORTS / "phase7_validation_report.md"
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"Saved {report}")
    print("Overall pass:", metrics["overall_pass"])
    print("Phase 7 complete.")


if __name__ == "__main__":
    main()
