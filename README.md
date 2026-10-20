# Ali — HEC stack

| Piece | Path | Port / URL |
|-------|------|------------|
| Comp-1 danger map API | `component-1-danger-map/` | http://localhost:8003 |
| Comp-2 sparse tracker API | `component-2-tracker/` | http://localhost:8001 |
| Comp-3 safe-road finder API | `component-3-safe-roads/` | http://localhost:8002 |
| Comp-4 Path-Guard API (Node) | `Component 4/.../backend/` | http://localhost:5001 |
| Comp-4 Path-Guard ML | `Component 4/.../ml-microservice/` | http://localhost:8004 |
| Next.js UI | `frontend/` | http://localhost:3000 |
| Comp-4 UI (standalone route) | `frontend/src/app/path-guard/` | http://localhost:3000/path-guard |

> **Note:** Port **8000** is often taken by other local apps on this machine, so Comp-1 uses **8003**.

One shared **root `.venv`** for Comp-1–3 and Comp-4 ML. Comp-4 Node API uses `npm` in its backend folder. Frontend talks over HTTP (Comp-4 also uses Socket.io on :5001). Auth service runs on **:8005**.

> **Source of truth:** this root layout (promoted from `New Changes`). Old copies live in `_old_archive/` — do not develop there. Cursor rule: `.cursor/rules/hec-source-of-truth.mdc`.

## Setup (once)

```powershell
cd c:\Sysconex\Ali
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### Comp-4 backend (once, if using Path-Guard)

```powershell
cd "c:\Sysconex\Ali\Component 4\R26-IT-136-IT22544636_Path_Guard\R26-IT-136-IT22544636_Path_Guard\backend"
npm install
```

Uses a local JSON file DB at `backend/data/db.json`. For the **main flow** (Anuradhapura with Comp-1–3), export roads from Comp-3 then reseed:

```powershell
cd c:\Sysconex\Ali
.\.venv\Scripts\activate
python "Component 4\R26-IT-136-IT22544636_Path_Guard\R26-IT-136-IT22544636_Path_Guard\backend\scripts\exportAnuradhapuraNetwork.py"
cd "Component 4\R26-IT-136-IT22544636_Path_Guard\R26-IT-136-IT22544636_Path_Guard\backend"
npm run seed
```

Open **http://localhost:3000** — flow is Comp-1 → 2 → 3 → **5 · Comp-4 safe path** on the main page.

### Optional: run one API alone

Still works from each component folder with the **root** venv:

```powershell
cd c:\Sysconex\Ali
.\.venv\Scripts\activate
cd component-1-danger-map
uvicorn api.main:app --reload --host 127.0.0.1 --port 8003
```
