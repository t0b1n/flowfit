# flowfit

Contact-point-first bike fit library with a FastAPI backend and React frontend.

## Setup

**Requirements:** [`uv`](https://github.com/astral-sh/uv), Node.js

```bash
# Create venv and install Python deps via uv (re-runs only if pyproject.toml changes)
make install

# Install web deps via npm ci (re-runs only if package-lock.json changes)
make web-install
```

## Running

### API

```bash
make api
# Runs FastAPI at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Web dev server

```bash
make web-dev
# Runs Vite dev server (default http://localhost:5173)
```

### Tests

```bash
make test
```

## Fit accuracy: what to check first

FlowFit fits from contact points, so these matter most (the in-app **Guide** tab has diagrams):

- **Saddle:** the default is an S-Works Power. The rider's sit bones are placed 163.2 mm back from the nose tip, with a 43.4 mm saddle stack above the rail centreline. For any other saddle, measure your contact point from the nose tip and your stack, then use **Saddle stack** and **Rail offset** (0 = clamp under the contact point).
- **Setback:** shown two ways. *Setback* is BB to contact point (what the fit targets). *Nose SB* is BB to nose tip (what fitters usually measure).
- **Body:** height and inseam set leg length. Enter tape-measured shoulder, arm, torso and shoe size under Advanced → Body dimensions.
- **Hip joint offset:** the rise from the sit bones to the hip joint is **80 mm** everywhere (Fit Builder, Fit Transfer and the Python solver). It changes the leg length the saddle height is solved for: 10 mm more offset gives about 10 mm lower saddle. Adjust it as "Saddle–hip joint offset".

## All make targets

```
make install      Create .venv and install Python deps via uv
make test         Run pytest
make api          Run FastAPI (uvicorn) on port 8000
make web-install  Install web deps via npm ci in web/
make web-dev      Run web dev server
make clean        Remove .venv and web artifacts
```
