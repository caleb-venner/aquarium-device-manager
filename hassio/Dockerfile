# Home Assistant Add-on specific Dockerfile
# Inherits from the base Docker image but with HA-specific configurations

# Build arguments for multi-arch
ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.1.1
FROM $BUILD_FROM

# Copy the application (built in CI/CD or pre-built)
COPY --from=aquarium-device-manager:latest /app /app

# Set Home Assistant specific environment
ENV HASSIO=true
ENV AQUA_BLE_CONFIG_DIR=/data

# Copy HA add-on specific files
COPY hassio/run.sh /
RUN chmod a+x /run.sh

# Health check for HA supervisor
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Labels for HA add-on system
LABEL \
    io.hass.name="Aquarium Device Manager" \
    io.hass.description="Manage Chihiros aquarium devices via Bluetooth LE" \
    io.hass.arch="armhf|aarch64|amd64|armv7" \
    io.hass.type="addon" \
    io.hass.version="1.0.0"

# Default command
CMD ["/run.sh"]
