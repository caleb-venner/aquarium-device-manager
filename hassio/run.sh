#!/usr/bin/with-contenv bashio

# ==============================================================================
# Home Assistant Add-on: Aquarium Device Manager
# Starts the Aquarium Device Manager service with HA configuration
# ==============================================================================

# Read configuration from add-on options
declare log_level
declare auto_discover
declare auto_reconnect
declare service_host
declare service_port

log_level=$(bashio::config 'log_level')
auto_discover=$(bashio::config 'auto_discover')
auto_reconnect=$(bashio::config 'auto_reconnect')
service_host=$(bashio::config 'service_host')
service_port=$(bashio::config 'service_port')

# Export environment variables
export AQUA_BLE_LOG_LEVEL="${log_level}"
export AQUA_BLE_AUTO_DISCOVER="${auto_discover}"
export AQUA_BLE_AUTO_RECONNECT="${auto_reconnect}"
export AQUA_BLE_SERVICE_HOST="${service_host}"
export AQUA_BLE_SERVICE_PORT="${service_port}"
export AQUA_BLE_CONFIG_DIR="/data"
export AQUA_BLE_FRONTEND_DIST="/app/frontend/dist"
export PYTHONPATH="/app/src"

# Log startup information
bashio::log.info "Starting Aquarium Device Manager..."
bashio::log.info "Log level: ${log_level}"
bashio::log.info "Auto discover: ${auto_discover}"
bashio::log.info "Auto reconnect: ${auto_reconnect}"
bashio::log.info "Service: ${service_host}:${service_port}"
bashio::log.info "Config directory: ${AQUA_BLE_CONFIG_DIR}"

# Ensure data directory exists
mkdir -p "${AQUA_BLE_CONFIG_DIR}"

# Check if Bluetooth is available
if ! bashio::services.available "bluetooth"; then
    bashio::log.warning "Bluetooth service is not available!"
    bashio::log.warning "Make sure Bluetooth is enabled in the add-on configuration."
fi

# Start the application
bashio::log.info "Starting Aquarium Device Manager service..."
cd /app
exec python -m aquarium_device_manager.service
