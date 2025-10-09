# Simple dev helpers

# Env flags (overridable). Export so recursive make and recipe shells inherit.
AQUA_BLE_AUTO_DISCOVER ?= 0
export AQUA_BLE_AUTO_DISCOVER

.PHONY: help dev dev-front dev-back build front-build lint test precommit clean

help:
	@echo "make dev        # run frontend (vite) and backend (uvicorn)"
	@echo "make dev-front  # run frontend dev server"
	@echo "make dev-back   # run backend with uvicorn"
	@echo "make build      # build frontend and python wheel"
	@echo "make front-build# build frontend only"
	@echo "make lint       # run pre-commit on all files"
	@echo "make test       # run pytest"
	@echo "make precommit  # install and run pre-commit hooks"
	@echo "make clean      # delete all saved device state and configs"
	@echo "make clean-dev  # clean then start dev servers"

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
	PYTHONPATH=src AQUA_BLE_AUTO_RECONNECT=1 uvicorn aquarium_device_manager.service:app --reload --host 0.0.0.0 --port 8000

# Combined

dev:
	@echo "Starting dev servers (frontend + backend)"
	@echo "Tip: In VS Code, run the 'dev: full stack' task to launch both in background."
	@$(MAKE) -j2 AQUA_BLE_AUTO_DISCOVER=0 dev-front dev-back

# Build & quality

build: front-build
	$(PY) -m build

lint:
	@if ! command -v pre-commit >/dev/null 2>&1; then \
		echo "Installing pre-commit (missing dependency)"; \
		$(PY) -m pip install pre-commit; \
	fi
	pre-commit run --all-files

precommit:
	pip install pre-commit
	pre-commit install
	pre-commit run --all-files

# Tests

test:
	pytest -q

# Cleanup

clean:
	@echo "🧹 Cleaning aquarium device manager state and configs..."
	@echo "📋 This will remove:"
	@echo "   • Device connection state and cache"
	@echo "   • Saved device configurations (dosers, lights)"
	@echo "   • Command history and runtime data"
	@if [ -d "$$HOME/.aqua-ble" ]; then \
		echo "📁 Removing $$HOME/.aqua-ble directory..."; \
		rm -rf "$$HOME/.aqua-ble"; \
		echo "✅ Cleaned: All device state, configurations, and cache data removed"; \
	else \
		echo "✨ Already clean: No $$HOME/.aqua-ble directory found"; \
	fi

# Convenience target: clean then dev
clean-dev: clean dev
