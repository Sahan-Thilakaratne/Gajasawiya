# HEC Frontend (Next.js)

Calls **Component 1** (`:8000`) and **Component 2** (`:8001`) APIs. No Streamlit.

## Run

```powershell
# Terminal 1 — all three APIs (shared root venv)
cd c:\Sysconex\Ali
.\.venv\Scripts\activate
python run_servers.py

# Terminal 2 — Frontend
cd c:\Sysconex\Ali\frontend
npm run dev
```

Open **http://localhost:3000**

## Flow

1. Run Comp-1 risk (district + rainfall month)  
2. Click a red hotspot (or pick from list)  
3. Run Comp-2 simulation + tracker  
4. Play / pause the EKF path + uncertainty circle  

## Env

`frontend/.env.local`:

```
NEXT_PUBLIC_COMP1_API=http://localhost:8003
NEXT_PUBLIC_COMP2_API=http://localhost:8001
NEXT_PUBLIC_COMP3_API=http://localhost:8002
```
