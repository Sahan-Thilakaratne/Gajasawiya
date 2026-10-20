# Phase 6 — colour scale

Palette: **green → yellow → orange → red** (`hec_risk`).

| Class | Approx. display range | Meaning |
|---|---|---|
| Low | 0 – 0.061 | Little overlap of elephants and people |
| Low–med | 0.061 – 0.121 | Some habitat or exposure |
| Medium | 0.121 – 0.182 | Rising overlap |
| High | 0.182 – 0.242 | Strong overlap |
| Very high | near 0.242+ | Farm / village / forest-edge hotspots |

Raw `risk_score` is `habitat_suitability × human_exposure` (0–1).
The PNG uses a 0–p98 stretch (vmax=0.2421) so spatial pattern is visible.
`risk_score_0_100` in the tables is min–max normalised across the district.
