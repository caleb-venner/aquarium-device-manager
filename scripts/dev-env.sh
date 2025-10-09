# Development environment configuration for all deployment types

# Shared configuration directory
mkdir -p .dev-env/data

# Environment variables for local development
export AQUA_BLE_CONFIG_DIR="$(pwd)/.dev-env/data"
export AQUA_BLE_FRONTEND_DIST="$(pwd)/frontend/dist"
export AQUA_BLE_LOG_LEVEL="DEBUG"
export AQUA_BLE_AUTO_DISCOVER="false"
export AQUA_BLE_AUTO_RECONNECT="true"
export AQUA_BLE_SERVICE_HOST="0.0.0.0"
export AQUA_BLE_SERVICE_PORT="8000"

echo "🔧 Development environment configured:"
echo "  Config dir: $AQUA_BLE_CONFIG_DIR"
echo "  Frontend:   $AQUA_BLE_FRONTEND_DIST"
echo "  Service:    $AQUA_BLE_SERVICE_HOST:$AQUA_BLE_SERVICE_PORT"
echo ""
echo "Available commands:"
echo "  ./scripts/build-all.sh     - Build all deployment options"
echo "  make dev                   - Start local development"
echo "  docker-compose -f docker/docker-compose.yml up  - Test Docker"
echo ""
echo "For Home Assistant add-on testing:"
echo "  1. Copy hassio/ to your HA add-ons directory"
echo "  2. Reload HA add-ons"
echo "  3. Install and test"
