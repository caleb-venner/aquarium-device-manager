# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS frontend-build

WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

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
COPY --from=frontend-build /app/dist ./frontend/dist

RUN pip install --upgrade pip \
    && pip install --no-cache-dir .

ENV CHIHIROS_FRONTEND_DIST="/app/frontend/dist"

EXPOSE 8000

CMD ["uvicorn", "chihiros_device_manager.service:app", "--host", "0.0.0.0", "--port", "8000"]
