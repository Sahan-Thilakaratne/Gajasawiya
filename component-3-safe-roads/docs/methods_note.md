# Component 3 — Methods note (draft)

## Prediction target

Road-segment **conflict exposure** probability `segment_risk ∈ [0,1]`, then risk-aware shortest path.

## Labels

Proxy: high Comp-1 `risk_score` on the corridor **and** human/farm/settlement edge indicators. Optional synthetic positive when a simulated elephant uncertainty circle overlaps a moderately risky segment.

**Not** official incident records.

## Features

Land / risk attributes from Comp-1 grids; highway class; length; hour-of-day; distance to simulated elephant; circle-overlap flag.

## Routing

- Shortest: minimize `length_m`
- Safer: minimize `length_m × (1 + λ × segment_risk)`

## Limits

OSM completeness; proxy labels; Kruger-style movement only via Comp-2 when used; not live DWC closures.
