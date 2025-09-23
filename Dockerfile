# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_HOME=/app

WORKDIR ${APP_HOME}

# Install system dependencies required for BLE (bluez provides bluetooth tooling)
RUN apt-get update \
    && apt-get install -y --no-install-recommends bluez \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements
COPY pyproject.toml setup.cfg README.md ./
COPY src ./src
COPY tools ./tools

RUN pip install --upgrade pip \
    && pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "chihiros_device_manager.service:app", "--host", "0.0.0.0", "--port", "8000"]
