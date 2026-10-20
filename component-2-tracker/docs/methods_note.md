# Component 2 — methods

## Aim

Estimate an elephant’s location **between sparse GPS-style updates**, with a measurable
uncertainty region, using a **synthetic** habitat-informed trajectory on Anuradhapura.

## Method

1. **Landscape** from Component 1 feature / risk grid (EPSG:5234, 500 m).
2. **Movement model (Movebank-fitted)** — download Kruger elephant GPS (CC0 DOI
   `10.5441/001/1.403h24q5/1`), estimate step speed, turning concentration, rest rate
   → `movement_params.json` (`source: movebank_fitted`). Statistics are **transferred**;
   tracks themselves are not replayed in Sri Lanka.
3. **Simulator** — biased random walk on Comp-1 attractiveness (habitat / tree / crop edge).
4. **Sparse collar** — hourly observations + GPS noise.
5. **Tracker** — constant-velocity EKF + **habitat-biased predict** (velocity nudged toward
   high Comp-1 attractiveness) + 2σ uncertainty radius (speed-capped).
6. **Alerts** — uncertainty circle overlaps high Comp-1 `risk_score` or near-settlement cells.
7. **Evaluation** — error vs true path; % of time truth lies inside the circle.

## Limitations

- Path is **simulated**, not a real Sri Lankan herd.
- Movement parameters are from **African** elephants (transfer caveat).
- Habitat bias is a soft heuristic, not a full step-selection function.

## Outputs

- `outputs/tracks/true_path.parquet`
- `outputs/tracks/hourly_pings.parquet`
- `outputs/tracks/ekf_track.parquet`
- `outputs/tracks/playback.json`
- `outputs/reports/evaluation_report.md`
- `data/processed/movement_params.json` / `movebank_fit_report.json`
