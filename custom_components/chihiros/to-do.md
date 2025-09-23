# BLE Service Roadmap

## Core Service
- Add optional polling scheduler for connected devices with per-device toggles.
- Harden auto-reconnect behaviour (backoff, retry limits, surfaced status messages).
- Enrich logging for command execution, persistence, and BLE connection lifecycle.

## Command & Client Coverage
- Expose remaining light automation helpers (auto mode, presets, RGB scheduling) via REST/UI.
- Provide CLI shim that delegates to the service API instead of direct BLE access.
- Publish simple Python client or OpenAPI description for third-party integrations.

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
