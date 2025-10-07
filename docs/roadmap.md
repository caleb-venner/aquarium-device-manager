# BLE Service Roadmap

## Core Service

- Add optional polling scheduler for connected devices with per-device toggles.
- Harden auto-reconnect behaviour (backoff, retry limits, surfaced status messages).
- Enrich logging for command execution, persistence, and BLE connection lifecycle.
- Add validation/clamping & startup warnings for environment variables (`CHIHIROS_STATUS_CAPTURE_WAIT` range (0 < x <= 10), `CHIHIROS_SERVICE_PORT` valid TCP port, boolean parsing for `CHIHIROS_AUTO_RECONNECT`, sane path existence check for `CHIHIROS_FRONTEND_DIST`).
- Remove unused legacy HTMX template & empty static directories once SPA feature parity achieved (audit `templates/` & `static/` for deletion).

## Command & Client Coverage

- Expose remaining light automation helpers (auto mode, presets, RGB scheduling) via REST/UI.
- Publish simple Python client or OpenAPI description for third-party integrations.

## Legacy CLI Status

- **REMOVED**: The legacy CLI and developer tools directory has been completely removed.
- For production integrations, use the FastAPI service endpoints at `/api/*`.

## Persistence & State

- Replace ad-hoc JSON cache writes with a versioned schema and validation on load.
- Surface cached data in the UI with diff/history to aid troubleshooting.

## Deployment

- Add `docker-compose.yml` example showing service plus optional reverse proxy.
- Document host BLE requirements per platform (BlueZ setup, macOS permissions, container capabilities).

## Testing & QA

- Expand unit tests for service methods (error paths, persistence) using mock devices.
- Add integration smoke test that exercises REST endpoints end-to-end with a fake BLE layer.
- Automate lint/test workflow (pre-commit or CI) for container builds.
