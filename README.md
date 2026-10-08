# PackMen — Smart-Corridor Emergency Dispatch

A live simulation of a city road network with emergency vehicles,
congestion-aware A\* routing, traffic-signal preemption and ML hazard detection —
with the accounts, roles and permanent record that make it a system rather than
a demo.

```
frontend (React, :5173)
   ├──► web_backend  (Node + Express + SQLite, :4000)   accounts, fleet, history
   └──► ml_backend   (Python + FastAPI, :8000)          live simulation + ML
              ▲
              └── web_backend subscribes to ml_backend's WebSocket and records
                  every mission and disaster as permanent history
```

## Run it

Three terminals:

```bash
# 1 — the simulation        (Python 3.10-3.13)
cd ml_backend && python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
# the ML detector is a separate, optional ~300MB install:
#   pip install -r requirements-ml.txt

# 2 — accounts and history        (needs Node 22.5+)
cd web_backend && npm install && npm run setup && npm run dev

# 3 — the console
cd frontend && npm install && npm run dev
```

Open <http://localhost:5173> and sign in as `dispatcher@packmen.local` /
`dispatch12345`.

If Python is not running, the console still works — click the pill in the top
bar to switch to the local browser engine.

## Where to read next

| Document | Covers |
|---|---|
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | The whole system: how the three services fit together, how one emergency flows through all of them, every endpoint, the auth model, the collector, design decisions and known limits. **Start here.** |
| [web_backend/README.md](web_backend/README.md) | The accounts and records service on its own — setup, schema, full API reference. |

## Tests

```bash
cd web_backend && npm test     # 48 API checks + 13 integration checks
```
