# Multi-stage Docker build for Aquarium Device Manager
# This Dockerfile is shared between standalone Docker and Home Assistant add-on

# Stage 1: Frontend build
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python runtime
FROM python:3.11-slim AS runtime

# Install system dependencies for Bluetooth
RUN apt-get update && apt-get install -y \
    bluetooth \
    bluez \
    build-essential \
    pkg-config \
    libdbus-1-dev \
    libglib2.0-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app user (security best practice)
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy Python requirements and install dependencies
COPY pyproject.toml setup.cfg ./
RUN pip install --no-cache-dir -e .

# Copy application source
COPY src/ src/

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/dist/ frontend/dist/

# Create data directory with proper permissions
RUN mkdir -p /data && chown -R appuser:appuser /data /app

# Switch to non-root user
USER appuser

# Environment variables
ENV PYTHONPATH=/app/src
ENV AQUA_BLE_CONFIG_DIR=/data
ENV AQUA_BLE_FRONTEND_DIST=/app/frontend/dist
ENV AQUA_BLE_SERVICE_HOST=0.0.0.0
ENV AQUA_BLE_SERVICE_PORT=8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Expose port
EXPOSE 8000

# Default command
CMD ["python", "-m", "aquarium_device_manager.service"]
