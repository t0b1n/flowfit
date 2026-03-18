.PHONY: help test api web-dev clean

VENV_DIR ?= .venv

help:
	@echo "Targets:"
	@echo "  make install      Create venv and install python deps via uv"
	@echo "  make test         Run pytest"
	@echo "  make api          Run FastAPI (uvicorn) on port 8000"
	@echo "  make web-install  Install web deps (npm ci) in web/"
	@echo "  make web-dev      Run web dev server"
	@echo "  make clean        Remove venv and web artifacts"

$(VENV_DIR)/.installed: pyproject.toml
	uv venv $(VENV_DIR)
	uv pip install --python $(VENV_DIR)/bin/python -e ".[dev]"
	touch $(VENV_DIR)/.installed

install: $(VENV_DIR)/.installed

test: $(VENV_DIR)/.installed
	. $(VENV_DIR)/bin/activate && pytest

api: $(VENV_DIR)/.installed
	. $(VENV_DIR)/bin/activate && uvicorn bikegeo_api.main:app --reload --port 8000

web/node_modules/.package-lock.json: web/package-lock.json
	cd web && npm ci
	touch web/node_modules/.package-lock.json

web-install: web/node_modules/.package-lock.json

web-dev: web/node_modules/.package-lock.json
	cd web && npm run dev

clean:
	rm -rf $(VENV_DIR)
	rm -rf web/node_modules web/dist
