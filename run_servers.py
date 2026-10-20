"""
Start all HEC component APIs from one shared venv (+ Comp-4 Node backend).

Usage (from repo root, with .venv activated):
  python run_servers.py

Ports:
  Comp-1 Danger Map  → http://127.0.0.1:8003
  Comp-2 Tracker     → http://0.0.0.0:8001
  Comp-3 Safe Roads  → http://0.0.0.0:8002
  Auth               → http://0.0.0.0:8005
  Comp-4 Path Guard ML → http://127.0.0.1:8004
  Comp-4 Path Guard API → http://127.0.0.1:5001

Each Python API loads its own api.main:app / app.main:app from its folder.
Comp-4 Node API is started separately (needs npm install in its backend folder).
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent

PATH_GUARD_ROOT = (
    ROOT
    / "Component 4"
    / "R26-IT-136-IT22544636_Path_Guard"
    / "R26-IT-136-IT22544636_Path_Guard"
)

PYTHON_SERVERS = [
    {
        "name": "Comp-1 Danger Map",
        "cwd": ROOT / "component-1-danger-map",
        "module": "api.main:app",
        "host": "127.0.0.1",
        "port": 8003,
    },
    {
        "name": "Comp-2 Tracker",
        "cwd": ROOT / "component-2-tracker",
        "module": "api.main:app",
        "host": "0.0.0.0",
        "port": 8001,
    },
    {
        "name": "Comp-3 Safe Roads",
        "cwd": ROOT / "component-3-safe-roads",
        "module": "api.main:app",
        "host": "0.0.0.0",
        "port": 8002,
    },
    {
        "name": "Auth Service (SQLite & Email)",
        "cwd": ROOT / "auth-service",
        "module": "api.main:app",
        "host": "0.0.0.0",
        "port": 8005,
    },
    {
        "name": "Comp-4 Path Guard ML",
        "cwd": PATH_GUARD_ROOT / "ml-microservice",
        "module": "app.main:app",
        "host": "127.0.0.1",
        "port": 8004,
    },
]

NODE_SERVERS = [
    {
        "name": "Comp-4 Path Guard API",
        "cwd": PATH_GUARD_ROOT / "backend",
        "script": "src/server.js",
        "host": "127.0.0.1",
        "port": 5001,
        "env": {
            "ML_SERVICE_URL": "http://127.0.0.1:8004",
            "PORT": "5001",
        },
    },
]


def _python_entry(cwd: Path, module: str) -> bool:
    if module.startswith("api.main"):
        return (cwd / "api" / "main.py").exists()
    if module.startswith("app.main"):
        return (cwd / "app" / "main.py").exists()
    return False


def _port_in_use(host: str, port: int) -> bool:
    """True if something is already accepting on host:port."""
    bind_host = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        try:
            return sock.connect_ex((bind_host, port)) == 0
        except OSError:
            return False


def main() -> int:
    missing = [
        s["name"]
        for s in PYTHON_SERVERS
        if not _python_entry(s["cwd"], s["module"])
    ]
    if missing:
        print("Missing Python entry for:", ", ".join(missing), file=sys.stderr)
        return 1

    procs: list[subprocess.Popen] = []
    labels: list[str] = []
    dead: set[str] = set()

    for s in PYTHON_SERVERS:
        url = f"http://{s['host']}:{s['port']}"
        if _port_in_use(s["host"], s["port"]):
            print(
                f"Skip {s['name']}: port {s['port']} already in use "
                f"(keeping existing process) -> {url}"
            )
            continue
        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            s["module"],
            "--reload",
            "--host",
            s["host"],
            "--port",
            str(s["port"]),
        ]
        print(f"Starting {s['name']} -> {url}")
        procs.append(subprocess.Popen(cmd, cwd=str(s["cwd"])))
        labels.append(s["name"])

    node_bin = shutil.which("node")
    for s in NODE_SERVERS:
        backend_dir = s["cwd"]
        server_js = backend_dir / s["script"]
        url = f"http://{s['host']}:{s['port']}"
        if not node_bin:
            print(
                f"Skipping {s['name']}: node not found on PATH",
                file=sys.stderr,
            )
            continue
        if not server_js.exists():
            print(
                f"Skipping {s['name']}: missing {server_js}",
                file=sys.stderr,
            )
            continue
        if _port_in_use(s["host"], s["port"]):
            print(
                f"Skip {s['name']}: port {s['port']} already in use "
                f"(keeping existing process) -> {url}"
            )
            continue
        env = os.environ.copy()
        env.update(s.get("env", {}))
        cmd = [node_bin, s["script"]]
        print(f"Starting {s['name']} -> {url}")
        procs.append(subprocess.Popen(cmd, cwd=str(backend_dir), env=env))
        labels.append(s["name"])

    if not procs:
        print(
            "Nothing new to start (ports already busy, or no launchable apps).",
            file=sys.stderr,
        )
        print("If Comp-1 was stuck, free the port then retry, e.g.:")
        print('  Get-NetTCPConnection -LocalPort 8003 | % { Stop-Process -Id $_.OwningProcess -Force }')
        return 0

    print("\nAPIs launching. Ctrl+C stops processes started by this script.\n")

    shutting_down = False

    def _shutdown(*_args: object) -> None:
        nonlocal shutting_down
        if shutting_down:
            return
        shutting_down = True
        print("\nStopping servers started by this script...")
        for p in procs:
            if p.poll() is None:
                p.terminate()
        deadline = time.time() + 8
        for p in procs:
            remaining = max(0.0, deadline - time.time())
            try:
                p.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                p.kill()

    signal.signal(signal.SIGINT, _shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _shutdown)

    try:
        while not shutting_down:
            alive = 0
            for p, name in zip(procs, labels):
                code = p.poll()
                if code is None:
                    alive += 1
                elif name not in dead:
                    dead.add(name)
                    print(
                        f"{name} exited with code {code} "
                        "(other services keep running)",
                        file=sys.stderr,
                    )
            if alive == 0:
                print("All managed processes have exited.", file=sys.stderr)
                return 1 if dead else 0
            time.sleep(0.5)
    except KeyboardInterrupt:
        _shutdown()
        return 0

    _shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
