# Aquarium Device Manager - AI Coding Guidelines

## Architecture Overview

**FastAPI Backend + TypeScript Frontend**: This project manages Chihiros aquarium devices (lights/dosers) over BLE. Backend uses `bleak` library for Bluetooth communication with a modular device class hierarchy. Frontend is a Vite-built SPA using Zustand for state management.

**Key Components**:
- `BLEService` (`ble_service.py`): Main orchestration class managing device connections, status caching, and persistence
- Device Classes (`device/`): `BaseDevice` with specific implementations (Doser, LightDevice, etc.)
- Command System (`commands/encoder.py`): Encodes BLE commands with message ID management and checksums
- REST API (`api/routes_*.py`): FastAPI endpoints for device control and status
- Frontend Store (`frontend/src/stores/deviceStore.ts`): Zustand store managing device state and command queue

**Data Flow**: BLE Device → `bleak` → `BaseDevice` → `BLEService` → REST API → Frontend Store → UI

## Developer Workflows

**Local Development**:
- `make dev`: Run both frontend (Vite) and backend (uvicorn) servers
- `make dev-back`: Backend only with auto-reload
- `make dev-front`: Frontend only with hot reload
- Environment variables prefixed `AQUA_BLE_*` control runtime behavior

**Quality Assurance**:
- `make test`: Run pytest suite
- `make lint`: Execute pre-commit hooks (black, isort, flake8, doc8)
- `pre-commit run --all-files`: Full quality check before commits

**Deployment Options**:
- Home Assistant Add-on (recommended)
- Docker container with multi-arch support
- Direct Python installation

## Project Conventions

**Device Command Encoding**:
- Commands use structured byte arrays: `[Command ID, Length, Message ID High/Low, Mode, Parameters..., Checksum]`
- Message IDs increment per session, skipping 0x5A (90) in both bytes
- Checksum is XOR of all command bytes
- Example: Manual brightness command `0x5A` (90) with mode `0x07` (7) for color channel and brightness value

**Device Class Hierarchy**:
```python
class BaseDevice(ABC):
    # BLE connection management, message ID tracking
    # Subclasses implement device-specific commands

class Doser(BaseDevice):
    device_kind = "doser"
    # Dosing pump control methods

class LightDevice(BaseDevice):
    device_kind = "light"
    # LED lighting control methods
```

**Status Caching Pattern**:
- `CachedStatus` dataclass stores device state with `raw_payload` (hex string) and `parsed` (dict)
- Status updates trigger cache refresh with configurable wait time (`AQUA_BLE_STATUS_WAIT`)
- Cached statuses persist to `~/.aqua-ble/state.json`

**Error Handling**:
- BLE operations use `bleak_retry_connector` with exponential backoff
- Device-specific exceptions: `DeviceNotFound`, `CharacteristicMissingError`
- API returns structured error responses with device context

**Configuration Management**:
- Environment variables migrate from `CHIHIROS_*` to `AQUA_BLE_*` prefix
- Device configs stored in `~/.aqua-ble/devices/` directory
- Automatic config migration on first run

## Integration Points

**BLE Protocol**: Reverse-engineered Chihiros UART service (`6E400001-B5A3-F393-E0A9-E50E24DCCA9E`) with RX/TX characteristics. Commands sent as notifications, responses received via notifications.

**Home Assistant**: Add-on provides automatic Bluetooth access and data persistence. Exposes devices as entities with MQTT integration potential.

**Frontend Communication**: REST API endpoints consumed by TypeScript frontend. Command queue managed client-side with retry logic and optimistic updates.

## Common Patterns

**Device Connection**:
```python
async with device_session(address) as device:
    # Device automatically disconnected on context exit
    await device.send_command(command_bytes)
```

**Command Encoding**:
```python
from .commands import encoder as commands
msg_id = commands.next_message_id(current_id)
payload = commands.encode_manual_brightness(msg_id, channel, brightness)
```

**Status Updates**:
```python
# Request status, wait for notification, cache result
await device.request_status()
await asyncio.sleep(STATUS_CAPTURE_WAIT_SECONDS)
cached_status = device.last_status
```

**API Response Formatting**:
```python
# Use serializers.cached_status_to_dict() for consistent API responses
return cached_status_to_dict(service, cached_status)
```

## Key Files to Reference

- `src/aquarium_device_manager/ble_service.py`: Main service orchestration
- `src/aquarium_device_manager/device/base_device.py`: BLE connection and messaging
- `src/aquarium_device_manager/commands/encoder.py`: Command encoding logic
- `frontend/src/stores/deviceStore.ts`: Frontend state management
- `pyproject.toml`: Dependencies and build configuration
- `Makefile`: Development workflow shortcuts
