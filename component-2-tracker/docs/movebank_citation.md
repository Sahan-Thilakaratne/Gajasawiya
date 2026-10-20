# Movement statistics — citation & honesty

## What we use

Component 2 transfers **movement statistics** (typical step length / speed / turning),
not Sri Lankan government collar tracks.

**Source (cite in dissertation):**

- Slotow, R., Thaker, M., & Vanak, A. T. (2019).  
  *ThermochronTracking Elephants Kruger 2007*. Movebank Data Repository.  
  https://doi.org/10.5441/001/1.403h24q5/1  

Licence: **CC0 1.0** (public domain dedication).

Related paper: Thaker et al. (2019) *Front. Ecol. Evol.* doi:10.3389/fevo.2019.00004

---

## Pipeline

```powershell
cd c:\Sysconex\Ali\component-2-tracker
..\component-1-danger-map\.venv\Scripts\activate

# 1) Download GPS CSV into data/raw/movebank/...
python src/download_movebank.py

# 2) Fit speed / turning / rest → data/processed/movement_params.json
python src/fit_movement_params.py

# 3) Full Comp-2 (also auto-runs 1–2 if needed)
python src/run_pipeline.py
```

`movement_params.json` with `"source": "movebank_fitted"` means parameters were
**estimated from the Movebank CSV**, not hand-tuned proxies.

Fit diagnostics: `data/processed/movebank_fit_report.json`

---

## What to tell the panel

> We do not have DWC Sri Lankan collars. We fit **published foreign GPS movement
> statistics** (Kruger, CC0), simulate a path on **Anuradhapura** Comp-1 habitat,
> then run a **habitat-biased sparse EKF** and measure error against synthetic ground truth.
