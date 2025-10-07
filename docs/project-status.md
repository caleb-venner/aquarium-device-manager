# Chihiros Device Manager

## Current Snapshot
- Snapshot: FastAPI BLE service with per-device locking and JSON-backed state exposes REST endpoints for status, scanning, connect/disconnect, and command execution.
- Vite + TypeScript SPA powered by Zustand delivers a modern dashboard with grouped device cards, quick actions, adaptive polling, and clear error handling.
- Command API returns persisted `CommandRecord`s so the UI can show history, retries, and command outcomes alongside live device data.

## Near-Term Focus
- Finish the synchronous command path (Phase 1): validate actions/args, enforce per-device locks, persist status transitions, and surface success/failure clearly.
- Raise test coverage on wattage calculations and BLE error flows using Vitest/Jest plus integration tests with mock devices.
- Keep the bundle lean by code-splitting dev/test tooling, tree-shaking unused utilities, and enabling strict TypeScript + linting.

## Planned Enhancements
- **Command platform:** queued workers with retry/backoff, WebSocket updates for live progress, and later scheduling/macros with permissions and audit export.
- **Service hardening:** optional polling scheduler, richer command logging, resilient auto-reconnect, and validated configuration plus versioned state storage.
- **Client integrations:** expose remaining light automation helpers via REST/UI, publish OpenAPI specs, and ship a lightweight Python client.
- **Deployability:** provide a `docker-compose` example, document platform-specific BLE requirements, and automate lint/test workflows in CI.

## Suggested Sequence
1. Ship Phase 1 command endpoint/UI updates with accompanying tests.
2. Introduce the worker + WebSocket layer while persisting pending queues across restarts.
3. Parallelize QA and DX improvements: expand suites, add bundle analysis, and enforce stricter compiler/tooling guards.

The system is healthy today; these steps keep the documentation concise while pointing directly at future functionality.
