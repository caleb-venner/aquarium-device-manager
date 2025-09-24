# Device Command System — Design & Implementation Plan

This document outlines a safe, incremental design and implementation plan for adding device command and control functionality to the Chihiros Device Manager. The approach prioritizes safety, observability, and iterativeness: ship a simple, synchronous command API first (Phase 1), then evolve to queued, non-blocking execution with real-time updates (Phase 2), and later add scheduling/advanced features (Phase 3).

## Goals and constraints

- Safety: commands must only run on explicit user action and be confirmable.
- Deterministic: operations should be idempotent when possible; use idempotency tokens for retries.
- Observable: show command progress, result, and a history/audit trail.
- Resilient: handle BLE disconnects, timeouts, retries, and report failures clearly.
- Incremental: start with a low-risk sync API, then add workers and real-time updates.

---

## Phase 1 — Minimal, synchronous command API (safe and fast to ship)

Goal: Provide a simple POST endpoint that executes a command synchronously and returns a persisted CommandRecord with status/result.

API sketch

- POST /api/devices/{address}/commands
  - Request body (JSON):
    - id?: str (optional client idempotency token)
    - action: str (e.g. "turn_on", "set_brightness", "set_schedule")
    - args?: object (action-specific parameters)
    - timeout?: float (seconds)
  - Behavior: validate action/args, persist a CommandRecord (status=pending), execute synchronously (within timeout), update record and persist result.
  - Responses:
    - 200: CommandRecord (with status success or failed)
    - 404: device not found / unreachable
    - 409: device busy (if we choose to disallow concurrent commands)
    - 422: invalid args
    - 504: timeout

- GET /api/devices/{address}/commands — list recent commands
- GET /api/devices/{address}/commands/{id} — fetch a single command record

Server behaviour

- Use a `CommandRecord` dataclass / Pydantic model, persisted in the same `STATE_PATH` JSON (or small sqlite later). Fields include id, address, action, args, status, attempts, created_at, started_at, completed_at, result, error.
- Execution flow:
  1. Persist record with status `pending`.
  2. Acquire per-service lock (or device lock) to avoid concurrent BLE operations.
  3. Mark `running`, call the mapped device method (re-using `_ensure_light`, `_ensure_doser`, `_capture_*`, existing helpers) with try/except.
  4. On success mark `success`, set result and `completed_at`.
  5. On BLE not found / connection error mark `failed` with clear reason.
  6. On timeout set `timed_out`.
  7. Persist record updates after each status transition.

Idempotency & concurrency

- Accept optional client-supplied idempotency `id` to avoid double execution on retries.
- For simplicity, disallow concurrent commands to the same device in Phase 1 (return 409) — safe default.

Persistence and durability

- Short-term: add a `commands` list per device into `STATE_PATH` JSON. This keeps things simple and human-readable.
- Medium-term: consider SQLite for transactional reliability and efficient queries.

Testing (Phase 1)

- Unit tests for action dispatchers and argument validation (Pydantic schemas).
- Integration tests using a fake/mock device implementing same interface as real devices: exercise POST endpoint, state updates, and saved JSON.

---

## Phase 2 — Queued worker + Real-time updates

Goal: Non-blocking commands, better UX for long-running operations, and resilience.

Additions

- Enqueue pattern: POST /api/devices/{address}/commands enqueues the command and immediately returns the CommandRecord with status `pending`.
- Background worker(s): asyncio task(s) that pop commands from a per-device FIFO queue and execute them (update record to `running`/`success`/`failed`).
- WebSocket endpoint: `/ws/commands` or `/ws/devices/{address}/commands` that pushes command state changes to subscribed clients. Clients update UI in real time.

Durability & restart behavior

- Persist commands whose status is not final (pending/running) so pending work survives restarts. On startup, workers should reload pending commands into queues.
- Implement retry policy with backoff for transient failures; attempts count should be recorded.

Concurrency

- A single worker per device or a small pool that ensures only one BLE operation runs at a time per device.

Why this helps

- UI is responsive: clients don’t block waiting for long operations.
- Long-running operations (firmware updates, large schedules) become practical.

---

## Phase 3 — Scheduling, macros, and advanced features

- Persisted scheduled commands (run at a future `scheduled_at`), recurring schedules.
- Command templates/macros and a simple UI for composing repeated tasks.
- Multi-user, authentication and permissions.
- Export/audit and integration with external automation systems.

---

## Command model (example JSON schema)

- CommandRecord (server persisted)

```json
{
  "id": "uuid4-hex",
  "address": "...",
  "action": "set_brightness",
  "args": { "brightness": 80, "color": 0 },
  "status": "pending|running|success|failed|timed_out|cancelled",
  "attempts": 0,
  "result": null,
  "error": null,
  "created_at": 1690000000.0,
  "started_at": null,
  "completed_at": null
}
```

Action dispatch mapping (example)

- `turn_on` -> device.turn_on()
- `turn_off` -> device.turn_off()
- `set_brightness` -> service.set_light_brightness(address, brightness, color)
- `set_doser_schedule` -> service.set_doser_schedule(...)
- `request_status` -> service.request_status(address)

Each action should have a small Pydantic schema for validating `args`.

---

## Frontend UX patterns

- Device control panel (Dashboard or Device view) with small action buttons; parameterized actions open a compact modal/inline form.
- Confirm for destructive actions (remove schedule, factory reset, etc.).
- After issuing a command:
  - Phase 1 (blocking): show spinner until response returns, then toast + history.
  - Phase 2 (queued): show pending row immediately, update via websocket.
- Command history: collapsible list with timestamp, action, args, result, ability to copy result or re-run.

Accessibility & safety

- Keyboard-accessible modals and buttons.
- Rate limits per-device to avoid flooding BLE.

---

## Tests and quality gates

- Unit tests for model validation and dispatchers.
- Integration tests with a mock device layer to simulate success, failure, timeouts.
- Linting & type checking.
- Smoke test: POST a command against the running server and verify command record state leads to the expected device method call on a fake device.

---

## Incremental implementation plan (concrete tasks)

1. Phase 1 (small PR)
   - Add `CommandRecord` dataclass / pydantic model.
   - Add `POST /api/devices/{address}/commands` executed synchronously.
   - Add `GET /api/devices/{address}/commands` and `GET /api/devices/{address}/commands/{id}`.
   - Persist command records in `STATE_PATH` JSON under each device or in a top-level `commands` map.
   - Frontend: small modal for `turn_on`, `turn_off`, basic brightness form; show blocking result and append to history.
   - Tests: unit + integration with fake devices.

2. Phase 2 (follow-up PR)
   - Convert POST to enqueue and return pending record.
   - Implement background worker(s) that process per-device queues.
   - Add WebSocket endpoint for push updates; client subscribes and updates history in real time.
   - Persist pending commands across restarts.

3. Phase 3
   - Scheduling, template actions, permissions, audit export.

---

## Implementation hints (where to hook into this codebase)

- Reuse `BLEService._ensure_light`, `BLEService._ensure_doser` and `_capture_*` helpers to perform device operations safely under existing locks.
- Add `service.execute_command(address, action, args, timeout)` which creates/persists the `CommandRecord`, performs the dispatch, updates status, and returns the record.
- For Phase 2, create `BLEService._command_queues: dict[address, asyncio.Queue]` and a worker task per queued device.

---

## Security & operational notes

- Limit allowed actions to predefined names and validate their args to avoid arbitrary execution.
- Add rate-limiting per device or per user to protect BLE infrastructure.
- Consider authentication if the service is exposed beyond localhost.

---

## Next step (I can implement this)

I can implement Phase 1 (synchronous POST command endpoint + persistence + minimal frontend control) now, including tests. Tell me if you want me to:

- Implement the server endpoints + simple Pydantic validation and persistence (Phase 1 server). or
- Scaffold Phase 2 (queue + worker + websocket) instead.

If Phase 1, confirm preferred persistence (append into `~/.chihiros_state.json` vs. small sqlite file `~/.chihiros_commands.db`).
