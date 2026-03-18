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

## All make targets

```
make install      Create .venv and install Python deps via uv
make test         Run pytest
make api          Run FastAPI (uvicorn) on port 8000
make web-install  Install web deps via npm ci in web/
make web-dev      Run web dev server
make clean        Remove .venv and web artifacts
```
