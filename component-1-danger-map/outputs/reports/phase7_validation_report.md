# Phase 7 — Validation report (RQ1)

**Overall pass:** YES

## 7.1 Spatial cross-validation

Habitat model trained with **GroupKFold** on ~10 km blocks (not random rows).

- Mean AUC: **0.841 ± 0.036**
- Mean TSS (Youden): **0.595**
- OOF AUC: **0.850** · OOF AP: **0.332** · OOF TSS: **0.565**

Per-fold table: `phase7_spatial_cv_tss.csv` · figure: `phase7_cv_bars.png`.

| Fold | AUC | AP | TSS |
|---:|---:|---:|---:|
| 1 | 0.831 | 0.369 | 0.582 |
| 2 | 0.892 | 0.435 | 0.730 |
| 3 | 0.795 | 0.277 | 0.497 |
| 4 | 0.829 | 0.275 | 0.553 |
| 5 | 0.859 | 0.376 | 0.614 |

## 7.2 Literature / known HEC pattern (proxy)

Published Sri Lankan HEC work (e.g. Fernando and co-authors) emphasises conflict at Dry Zone forest–agriculture interfaces and around protected-area edges, not in deep uninhabited forest. Anuradhapura lies in that Dry Zone pattern. This project does not re-digitise restricted incident coordinates; instead we test whether our open-data risk surface is enriched for the same structural setting (forest edge, cropland, nearer settlements).

| Test | High-risk (p90) | Rest | Pass |
|---|---:|---:|---|
| Forest-edge rate | 61.45% | 30.44% | True |
| Mean cropland fraction | 0.300 | 0.142 | True |
| Mean dist. to settlement (m) | 1909 | 4047 | True |

If official DS-division HEC intensity tables are added later, overlay them here as an extra check.

## 7.3 Sanity checks

Expectation: **deep interior forest far from people** has lower overlap risk than **forest–farm edges**.

| Class | n | mean risk | median | p90 |
|---|---:|---:|---:|---:|
| Deep interior forest | 7854 | 0.0027 | 0.0003 | 0.0050 |
| Forest edge (all) | 9665 | 0.0444 | 0.0093 | 0.1321 |
| Farm + forest edge | 7749 | 0.0487 | 0.0104 | 0.1462 |

**Pass (edge > deep):** True
**Pass (near settlement > protected far):** True

Figure: `phase7_sanity_boxplot.png`.

## 7.4 Sensitivity — drop population from exposure

Removing population softens risk in dense villages but keeps farm/forest-edge structure via cropland and built-up. High Spearman / Jaccard ⇒ map is not driven by population alone.

- Spearman correlation (with vs without pop): **0.786**
- Top-10% hotspot Jaccard overlap: **0.659**
- Mean |Δ risk|: **0.0091**

Figure: `phase7_sensitivity_scatter.png`.

## Limitations (honest)

- Occurrence data are citizen-science biased (Phase 3 note).
- No restricted DWC incident GIS layer was used.
- Literature agreement is **structural** (edge / farm / settlement), not cell-by-cell vs named herds.
- AP is modest under 1:10 class imbalance; **AUC / TSS** are the primary ranking metrics.
