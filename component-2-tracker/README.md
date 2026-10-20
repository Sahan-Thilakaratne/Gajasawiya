# Component 2 — Sparse elephant tracker

**Everyday name:** Follow the animal even when we only get a location once in a while.

**District:** Anuradhapura (same as Component 1)  
**API port:** **8001** (Comp-1 is **8003**)  
**UI:** Next.js app in `../frontend` (not Streamlit)

---

## What this component does

1. **Simulate** a habitat-informed elephant path on Anuradhapura.
2. Keep only **hourly GPS-style pings**.
3. **EKF** between pings → estimate + uncertainty circle.
4. Measure error vs synthetic true path.
5. Alert when circle hits high Comp-1 risk / settlements.

**Honesty:** Movebank-fitted Kruger movement stats (CC0) transferred to Sri Lankan geography — not DWC collars.

---

## Setup (own venv)

```powershell
cd c:\Sysconex\Ali\component-2-tracker
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Run API

```powershell
.\.venv\Scripts\activate
uvicorn api.main:app --reload --host 0.0.0.0 --port 8001
```

Docs: http://localhost:8001/docs · Contract: `docs/FRONTEND_API.md`

Pipeline (offline):

```powershell
python src/run_pipeline.py
```

## Frontend

See `../frontend/README.md` — calls Comp-1 + Comp-2 APIs.
