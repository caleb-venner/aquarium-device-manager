# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS frontend-build
RUN apk update && apk upgrade

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app/web

# Copy package files (ensure package-lock.json exists)
COPY --chown=nodejs:nodejs web/package.json web/package-lock.json ./

# Switch to non-root user
USER nodejs

# Install dependencies with clean install
RUN npm ci --only=production --ignore-scripts

# Copy frontend source
COPY --chown=nodejs:nodejs web/ ./

# Build the frontend
RUN npm run build

FROM python:3.13-slim

# Install system dependencies for Bluetooth LE support
RUN apt-get update && apt-get install -y \
    bluez=5.* \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Copy Python source
COPY --chown=appuser:appuser src/ ./src/
COPY --chown=appuser:appuser pyproject.toml README.md ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Copy built frontend from previous stage
COPY --from=frontend-build --chown=appuser:appuser /app/web/dist ./web/dist

# Switch to non-root user
USER appuser

# Set environment variable for frontend location
ENV AQUA_BLE_FRONTEND_DIST=/app/web/dist

# Expose the service port
EXPOSE 8000

# Run the service
CMD ["python", "-m", "uvicorn", "aquarium_device_manager.service:app", "--host", "0.0.0.0", "--port", "8000"]
