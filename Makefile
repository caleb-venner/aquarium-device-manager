# Simple dev helpers

# Env flags (overridable). Export so recursive make and recipe shells inherit.
# CHIHIROS_AUTO_DISCOVER_ON_START ?= 0
# export CHIHIROS_AUTO_DISCOVER_ON_START

.PHONY: help dev dev-front dev-back build front-build lint test precommit

help:
	@echo "make dev        # run frontend (vite) and backend (uvicorn)"
	@echo "make dev-front  # run frontend dev server"
	@echo "make dev-back   # run backend with uvicorn"
	@echo "make build      # build frontend and python wheel"
	@echo "make front-build# build frontend only"
	@echo "make lint       # run pre-commit on all files"
	@echo "make test       # run pytest"
	@echo "make precommit  # install and run pre-commit hooks"

VENV?=.venv
PY?=python3

$(VENV)/bin/activate:
	$(PY) -m venv $(VENV)
	. $(VENV)/bin/activate; pip install -U pip

# Frontend

dev-front:
	cd frontend && npm run dev

front-build:
	cd frontend && npm run build

# Backend

dev-back:
	PYTHONPATH=src CHIHIROS_AUTO_RECONNECT=1 uvicorn chihiros_device_manager.service:app --reload --host 0.0.0.0 --port 8000

# Combined

dev:
	@echo "Starting dev servers (frontend + backend)"
	@echo "Tip: In VS Code, run the 'dev: full stack' task to launch both in background."
	@$(MAKE) -j2 dev-front dev-back

# Build & quality

build: front-build
	$(PY) -m build

lint:
	pre-commit run --all-files

precommit:
	pip install pre-commit
	pre-commit install
	pre-commit run --all-files

# Tests

test:
	pytest -q
