"""BLE service module extracted from service.py.

Contains the BLEService orchestration class and supporting CachedStatus dataclass.
This is a mechanical extract so tests and callers can continue to import
from chihiros_device_manager.service while the implementation lives here.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, is_dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Sequence, cast

from fastapi import HTTPException

try:
    from bleak_retry_connector import BleakConnectionError, BleakNotFoundError
except ImportError:  # pragma: no cover - fallback if library changes

    class BleakNotFoundError(Exception):
        """Placeholder when bleak_retry_connector is unavailable."""

        pass

    class BleakConnectionError(Exception):
        """Placeholder when bleak_retry_connector is unavailable."""

        pass


from datetime import time as _time
from typing import AsyncIterator, Iterable, Tuple, Type

from bleak import BleakScanner
from bleak.backends.device import BLEDevice

from . import serializers as _serializers
from .commands import encoder as commands
from .commands import encoder as doser_commands
from .commands import ops as device_commands
from .device import (
    Doser,
    LightDevice,
    get_device_from_address,
    get_model_class_from_name,
)
from .device.base_device import BaseDevice
from .exception import DeviceNotFound

# Re-implement lightweight internal API functions (previously in core_api)
SupportedDeviceInfo = Tuple[BLEDevice, Type[BaseDevice]]


def filter_supported_devices(
    devices: Iterable[BLEDevice],
) -> list[SupportedDeviceInfo]:
    """Return BLE devices that map to a known Chihiros model.

    This intentionally ignores devices that do not map to a known model
    (for example, TVs or other unrelated BLE peripherals). Calling
    `get_model_class_from_name` may raise DeviceNotFound for unknown
    device names; swallow that and continue so discovery is robust.
    """
    supported: list[SupportedDeviceInfo] = []
    for device in devices:
        name = device.name
        if not name:
            continue
        try:
            model_class = get_model_class_from_name(name)
        except DeviceNotFound:
            # Unknown device name — skip it
            continue
        # type: ignore[attr-defined]
        codes = getattr(model_class, "model_codes", [])
        if not codes:
            continue
        supported.append((device, model_class))
    return supported


async def discover_supported_devices(
    timeout: float = 5.0,
) -> list[SupportedDeviceInfo]:
    """Discover BLE devices and return the supported Chihiros models."""
    discovered = await BleakScanner.discover(timeout=timeout)
    return filter_supported_devices(discovered)


@asynccontextmanager
async def device_session(address: str) -> AsyncIterator[BaseDevice]:
    """Connect to a device and ensure it is disconnected afterwards."""
    device = await get_device_from_address(address)
    try:
        yield device
    finally:
        await device.disconnect()


# Persistence and runtime configuration
STATE_PATH = Path.home() / ".chihiros_state.json"
AUTO_RECONNECT_ENV = "CHIHIROS_AUTO_RECONNECT"
STATUS_CAPTURE_WAIT_ENV = "CHIHIROS_STATUS_CAPTURE_WAIT"
AUTO_DISCOVER_ENV = "CHIHIROS_AUTO_DISCOVER_ON_START"
try:
    STATUS_CAPTURE_WAIT_SECONDS = float(
        os.getenv(STATUS_CAPTURE_WAIT_ENV, "1.5")
    )
except ValueError:  # pragma: no cover - defensive parse guard
    STATUS_CAPTURE_WAIT_SECONDS = 1.5


def _get_env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    s = raw.strip()
    if s == "":
        return default
    lowered = s.lower()
    if lowered in ("1", "true", "yes", "on"):
        return True
    if lowered in ("0", "false", "no", "off"):
        return False
    try:
        return bool(int(s))
    except ValueError:
        return default


# Module logger
logger = logging.getLogger("chihiros_device_manager.service")
_default_level = os.getenv("CHIHIROS_LOG_LEVEL", "INFO").upper()
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=getattr(logging, _default_level, logging.INFO),
        format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
    )
try:
    logger.setLevel(getattr(logging, _default_level, logging.INFO))
except Exception:
    logger.setLevel(logging.INFO)


@dataclass(slots=True)
class CachedStatus:
    """Serialized snapshot for persistence."""

    address: str
    device_type: str
    raw_payload: str | None
    parsed: Dict[str, Any] | None
    updated_at: float
    model_name: str | None = None
    channels: list[Dict[str, Any]] | None = None


class BLEService:
    """Manages BLE devices, status cache, and persistence."""

    def __init__(self) -> None:
        """Initialize the BLEService, device maps and runtime flags."""
        self._lock = asyncio.Lock()
        self._devices: Dict[str, BaseDevice] = {}
        self._addresses: Dict[str, str] = {}
        self._cache: Dict[str, CachedStatus] = {}
        self._commands: Dict[str, list] = {}  # Per-device command history
        self._auto_reconnect = _get_env_bool(AUTO_RECONNECT_ENV, True)
        self._auto_discover_on_start = _get_env_bool(AUTO_DISCOVER_ENV, False)
        self._reconnect_task: asyncio.Task | None = None
        self._discover_task: asyncio.Task | None = None

    @property
    def _doser(self) -> Optional[Doser]:
        """Return the currently connected doser device if present."""
        return cast(Optional[Doser], self._devices.get("doser"))

    @_doser.setter
    def _doser(self, value: Optional[Doser]) -> None:
        """Set or clear the cached doser device reference."""
        if value is None:
            self._devices.pop("doser", None)
        else:
            self._devices["doser"] = value

    @property
    def _doser_address(self) -> Optional[str]:
        """Return the stored address for the doser device, if any."""
        return self._addresses.get("doser")

    @_doser_address.setter
    def _doser_address(self, value: Optional[str]) -> None:
        """Set or clear the stored doser address."""
        if value is None:
            self._addresses.pop("doser", None)
        else:
            self._addresses["doser"] = value

    @property
    def _light(self) -> Optional[LightDevice]:
        """Return the currently connected light device if present."""
        return cast(Optional[LightDevice], self._devices.get("light"))

    @_light.setter
    def _light(self, value: Optional[LightDevice]) -> None:
        """Set or clear the cached light device reference."""
        if value is None:
            self._devices.pop("light", None)
        else:
            self._devices["light"] = value

    @property
    def _light_address(self) -> Optional[str]:
        """Return the stored address for the light device, if any."""
        return self._addresses.get("light")

    @_light_address.setter
    def _light_address(self, value: Optional[str]) -> None:
        """Set or clear the stored light address."""
        if value is None:
            self._addresses.pop("light", None)
        else:
            self._addresses["light"] = value

    def current_device_address(self, device_type: str) -> Optional[str]:
        """Return the current address for a device type, if known."""
        return self._addresses.get(device_type.lower())

    @staticmethod
    def _normalize_kind(device_type: Optional[str]) -> str:
        """Normalize a device type string to a lower-case kind."""
        return (device_type or "device").lower()

    def _format_message(self, device_type: Optional[str], category: str) -> str:
        """Format a user-friendly error message for device errors."""
        kind = self._normalize_kind(device_type)
        label = kind.capitalize()
        if category == "not_found":
            return f"{label} not found"
        if category == "wrong_type":
            return f"Device is not a {kind}"
        if category == "not_connected":
            return f"{label} not connected"
        if category == "not_reachable":
            return f"{label} not reachable"
        return f"{label} error"

    def _get_device_kind(
        self, device: BaseDevice | Type[BaseDevice]
    ) -> Optional[str]:
        """Return the device kind attribute lowercased if present."""
        kind = getattr(device, "device_kind", None)
        if isinstance(kind, str) and kind:
            return kind.lower()
        return None

    async def connect_device(
        self, address: str, device_type: Optional[str] = None
    ) -> CachedStatus:
        """Connect to a device by address and return its cached status."""
        device = await self._ensure_device(address, device_type)
        device_kind = self._get_device_kind(device)
        if device_kind is None:
            raise HTTPException(
                status_code=400, detail="Unsupported device type"
            )
        return await self._refresh_device_status(device_kind, persist=True)

    async def _ensure_device(
        self, address: str, device_type: Optional[str] = None
    ) -> BaseDevice:
        expected_kind = device_type.lower() if device_type else None
        async with self._lock:
            if expected_kind:
                current_device = self._devices.get(expected_kind)
                current_address = self._addresses.get(expected_kind)
                if current_device and current_address == address:
                    return current_device
                if current_device:
                    await current_device.disconnect()
                    self._devices.pop(expected_kind, None)
                    self._addresses.pop(expected_kind, None)
            try:
                device = await get_device_from_address(address)
            except Exception as exc:
                raise HTTPException(
                    status_code=404,
                    detail=self._format_message(expected_kind, "not_found"),
                ) from exc
            kind = self._get_device_kind(device)
            if kind is None:
                raise HTTPException(
                    status_code=400, detail="Unsupported device type"
                )
            if expected_kind and kind != expected_kind:
                raise HTTPException(
                    status_code=400,
                    detail=self._format_message(expected_kind, "wrong_type"),
                )
            existing = self._devices.get(kind)
            if existing:
                await existing.disconnect()
            self._devices[kind] = device
            self._addresses[kind] = address
            return device

    async def _refresh_device_status(
        self, device_type: str, *, persist: bool = True
    ) -> CachedStatus:
        normalized = device_type.lower()
        device: BaseDevice | None = None
        address: Optional[str] = None
        async with self._lock:
            device = self._devices.get(normalized)
            address = self._addresses.get(normalized)
            if not device or not address:
                raise HTTPException(
                    status_code=400,
                    detail=self._format_message(normalized, "not_connected"),
                )
            serializer_name = getattr(
                device.__class__, "status_serializer", None
            )
            if serializer_name is None:
                serializer_name = getattr(device, "status_serializer", None)
        serializer = getattr(_serializers, serializer_name, None)
        if serializer is None:  # pragma: no cover - defensive guard
            raise HTTPException(
                status_code=500,
                detail=f"Missing serializer '{serializer_name}' for {normalized}",
            )
        try:
            logger.debug("Requesting %s status from %s", normalized, address)
            await device.request_status()
        except (BleakNotFoundError, BleakConnectionError) as exc:
            logger.warning(
                "%s not reachable %s: %s",
                normalized.capitalize(),
                address,
                exc,
            )
            raise HTTPException(
                status_code=404,
                detail=self._format_message(normalized, "not_reachable"),
            ) from exc
        await asyncio.sleep(STATUS_CAPTURE_WAIT_SECONDS)
        status_obj = getattr(device, "last_status", None)
        if not status_obj:
            raise HTTPException(
                status_code=500,
                detail=f"No status received from {normalized}",
            )
        try:
            parsed = serializer(status_obj)
        except TypeError:
            if not is_dataclass(status_obj):
                parsed = dict(vars(status_obj))
            else:
                raise
        raw_payload = getattr(status_obj, "raw_payload", None)
        raw_hex = (
            raw_payload.hex()
            if isinstance(raw_payload, (bytes, bytearray))
            else None
        )
        channels = self._build_channels(normalized, device)
        cached = CachedStatus(
            address=address,
            device_type=normalized,
            raw_payload=raw_hex,
            parsed=parsed,
            updated_at=time.time(),
            model_name=getattr(device, "model_name", None),
            channels=channels,
        )
        if persist:
            self._cache[address] = cached
        if persist:
            await self._save_state()
        return cached

    def _build_channels(
        self, device_type: str, device: BaseDevice
    ) -> list[Dict[str, Any]] | None:
        if device_type != "light":
            return None
        color_map = getattr(device, "colors", {})
        if not isinstance(color_map, dict) or not color_map:
            return None
        return [
            {"name": name, "index": idx}
            for name, idx in sorted(
                ((str(key), int(value)) for key, value in color_map.items()),
                key=lambda item: item[1],
            )
        ]

    def _infer_device_type(self, device: BaseDevice) -> Optional[str]:
        return self._get_device_kind(device)

    async def start(self) -> None:
        """Start background tasks and load persisted state."""
        await self._load_state()
        logger.info("Service start: loaded %d cached devices", len(self._cache))
        logger.info(
            "Settings: auto_discover_on_start=%s, "
            "auto_reconnect=%s, capture_wait=%.2fs",
            self._auto_discover_on_start,
            self._auto_reconnect,
            STATUS_CAPTURE_WAIT_SECONDS,
        )
        discover_scheduled = False
        if not self._cache and self._auto_discover_on_start:
            try:
                logger.info("Auto-discover enabled; scheduling background scan")
                self._discover_task = asyncio.create_task(
                    self._auto_discover_worker()
                )
                discover_scheduled = True
                logger.info("Auto-discover worker scheduled in background")
            except Exception as exc:  # pragma: no cover - runtime diagnostics
                logger.warning("Failed to schedule auto-discover: %s", exc)
        if self._auto_reconnect:
            if discover_scheduled:
                logger.info(
                    "Auto-reconnect enabled; will be decided by auto-discover worker"
                )
            else:
                logger.info(
                    "Auto-reconnect enabled; attempting reconnect to cached devices"
                )
                self._reconnect_task = asyncio.create_task(
                    self._reconnect_and_refresh()
                )
                logger.info("Reconnect worker scheduled in background")

    async def _auto_discover_worker(self) -> None:
        """Background worker that auto-discovers and connects devices."""
        try:
            logger.info("Auto-discover worker: scanning for supported devices")
            connected_any = await self._auto_discover_and_connect()
            if connected_any and self._cache:
                try:
                    await self._save_state()
                    logger.info(
                        "Auto-discover worker: saved discovered devices"
                    )
                except Exception:  # pragma: no cover - defensive
                    logger.exception(
                        "Failed to persist state after auto-discover"
                    )
            else:
                if self._auto_reconnect:
                    logger.info(
                        "Auto-discover found no devices; scheduling reconnect worker"
                    )
                    if (
                        self._reconnect_task is None
                        or self._reconnect_task.done()
                    ):
                        self._reconnect_task = asyncio.create_task(
                            self._reconnect_and_refresh()
                        )
                        logger.info(
                            "Reconnect worker scheduled by auto-discover worker"
                        )
        except asyncio.CancelledError:
            logger.info("Auto-discover worker cancelled")
            raise
        except Exception:  # pragma: no cover - runtime diagnostics
            logger.exception("Auto-discover worker failed unexpectedly")

    async def _reconnect_and_refresh(self) -> None:
        """Reconnect to cached devices and refresh their live status."""
        try:
            await self._attempt_reconnect()
            for address, status in list(self._cache.items()):
                try:
                    logger.debug(
                        "Refreshing live status for %s (type=%s)",
                        address,
                        status.device_type,
                    )
                    await self._ensure_device(address, status.device_type)
                    live = await self._refresh_device_status(status.device_type)
                    self._cache[address] = live
                    logger.info("Refreshed %s %s", status.device_type, address)
                except (
                    Exception
                ) as exc:  # pragma: no cover - runtime diagnostics
                    logger.warning("Failed to refresh %s: %s", address, exc)
                    continue
            await self._save_state()
        except asyncio.CancelledError:
            logger.info("Reconnect worker cancelled")
            raise
        except Exception:  # pragma: no cover - runtime diagnostics
            logger.exception("Reconnect worker failed unexpectedly")

    async def stop(self) -> None:
        """Stop background workers and persist current service state."""
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                logger.debug("Reconnect task cancelled during stop()")
        if self._discover_task is not None:
            self._discover_task.cancel()
            try:
                await self._discover_task
            except asyncio.CancelledError:
                logger.debug("Auto-discover task cancelled during stop()")
        await self._save_state()
        async with self._lock:
            for device in self._devices.values():
                await device.disconnect()
            self._devices.clear()
            self._addresses.clear()

    async def scan_devices(self, timeout: float = 5.0) -> list[Dict[str, Any]]:
        """Scan for BLE devices and return those matching known models."""
        supported = await discover_supported_devices(timeout=timeout)
        result: list[Dict[str, Any]] = []
        for device, model_class in supported:
            device_type = self._get_device_kind(model_class) or "unknown"
            result.append(
                {
                    "address": device.address,
                    "name": device.name,
                    "product": getattr(model_class, "model_name", device.name),
                    "device_type": device_type,
                }
            )
        return result

    async def request_status(self, address: str) -> CachedStatus:
        """Request and return the status for a device by address."""
        logger.info("Manual request_status for %s", address)
        status = self._cache.get(address)
        if status:
            try:
                return await self.connect_device(address, status.device_type)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            device = await get_device_from_address(address)
        except Exception as exc:
            logger.warning(
                "request_status: device not found for %s: %s", address, exc
            )
            raise HTTPException(
                status_code=404, detail="Device not found"
            ) from exc

        device_type = self._infer_device_type(device)
        if not device_type:
            raise HTTPException(
                status_code=400, detail="Unsupported device type"
            )

        logger.debug(
            "request_status: identified %s at %s, ensuring connection",
            device_type,
            address,
        )
        return await self.connect_device(address, device_type)

    async def disconnect_device(self, address: str) -> None:
        """Disconnect a connected device by address if present."""
        async with self._lock:
            for kind, current_address in list(self._addresses.items()):
                if current_address == address:
                    device = self._devices.pop(kind, None)
                    self._addresses.pop(kind, None)
                    if device:
                        await device.disconnect()
                    break

    def get_status_snapshot(self) -> Dict[str, CachedStatus]:
        """Return an in-memory copy of the cached device statuses."""
        return self._cache.copy()

    async def set_doser_schedule(
        self,
        address: str,
        *,
        head_index: int,
        volume_tenths_ml: int,
        hour: int,
        minute: int,
        weekdays: Sequence[doser_commands.PumpWeekday] | None = None,
        confirm: bool = False,
        wait_seconds: float = 1.5,
    ) -> CachedStatus:
        """Set a doser schedule on the given device address."""
        return await device_commands.set_doser_schedule(
            self,
            address,
            head_index=head_index,
            volume_tenths_ml=volume_tenths_ml,
            hour=hour,
            minute=minute,
            weekdays=weekdays,
            confirm=confirm,
            wait_seconds=wait_seconds,
        )

    async def set_light_brightness(
        self, address: str, *, brightness: int, color: str | int = 0
    ) -> CachedStatus:
        """Set brightness (and optional color) for a light device."""
        return await device_commands.set_light_brightness(
            self, address, brightness=brightness, color=color
        )

    async def turn_light_on(self, address: str) -> CachedStatus:
        """Turn the light device at the address on."""
        return await device_commands.turn_light_on(self, address)

    async def turn_light_off(self, address: str) -> CachedStatus:
        """Turn the light device at the address off."""
        return await device_commands.turn_light_off(self, address)

    async def enable_auto_mode(self, address: str) -> CachedStatus:
        """Enable auto mode on the specified light device."""
        return await device_commands.enable_auto_mode(self, address)

    async def set_manual_mode(self, address: str) -> CachedStatus:
        """Switch the specified light device to manual mode."""
        return await device_commands.set_manual_mode(self, address)

    async def reset_auto_settings(self, address: str) -> CachedStatus:
        """Reset auto mode settings on the specified light device."""
        return await device_commands.reset_auto_settings(self, address)

    async def add_light_auto_setting(
        self,
        address: str,
        *,
        sunrise: _time,
        sunset: _time,
        brightness: object,
        ramp_up_minutes: int = 0,
        weekdays: list[commands.LightWeekday] | None = None,
    ) -> CachedStatus:
        """Add an auto program to a light device."""
        return await device_commands.add_light_auto_setting(
            self,
            address,
            sunrise=sunrise,
            sunset=sunset,
            brightness=brightness,
            ramp_up_minutes=ramp_up_minutes,
            weekdays=weekdays,
        )

    async def get_live_statuses(self) -> tuple[list[CachedStatus], list[str]]:
        """Capture live statuses for known device kinds and return results.

        Returns a tuple of (results, errors).
        """
        results: list[CachedStatus] = []
        errors: list[str] = []

        # Use the generic capture helper for both device kinds. This keeps a
        # single patch point for tests and avoids duplicating collection logic.
        for device_kind in ("doser", "light"):
            try:
                status = await self._refresh_device_status(
                    device_kind, persist=False
                )
            except HTTPException as exc:
                if exc.status_code == 400:
                    continue
                errors.append(str(exc.detail))
            else:
                results.append(status)

        return results, errors

    async def _load_state(self) -> None:
        if not STATE_PATH.exists():
            return
        try:
            data = json.loads(STATE_PATH.read_text())
        except json.JSONDecodeError:
            return
        devices = data.get("devices", {})
        cache: Dict[str, CachedStatus] = {}
        for address, payload in devices.items():
            cache[address] = CachedStatus(
                address=address,
                device_type=payload.get("device_type", "unknown"),
                raw_payload=payload.get("raw_payload"),
                parsed=payload.get("parsed"),
                updated_at=payload.get("updated_at", 0.0),
                model_name=payload.get("model_name"),
                channels=payload.get("channels"),
            )
        self._cache = cache

        # Load command history
        commands = data.get("commands", {})
        self._commands = {
            address: cmd_list for address, cmd_list in commands.items()
        }

    async def _save_state(self) -> None:
        data = {
            "devices": {
                address: {
                    "device_type": status.device_type,
                    "raw_payload": status.raw_payload,
                    "parsed": status.parsed,
                    "updated_at": status.updated_at,
                    "model_name": status.model_name,
                    "channels": status.channels,
                }
                for address, status in self._cache.items()
            },
            "commands": self._commands,
        }
        STATE_PATH.write_text(json.dumps(data, indent=2, sort_keys=True))

    async def _attempt_reconnect(self) -> None:
        if self._cache:
            for address, status in list(self._cache.items()):
                try:
                    logger.info(
                        "Attempting reconnect to %s (type=%s)",
                        address,
                        status.device_type,
                    )
                    await self.connect_device(address, status.device_type)
                except HTTPException as exc:
                    logger.warning(
                        "Reconnect failed for %s: %s",
                        address,
                        getattr(exc, "detail", exc),
                    )
                    continue

    async def _auto_discover_and_connect(self) -> bool:
        supported = await discover_supported_devices(timeout=5.0)
        if not supported:
            logger.info("No supported devices discovered")
            return False
        logger.info("Discovered %d supported devices", len(supported))
        connected_any = False
        for device, model_class in supported:
            address = device.address
            try:
                inferred_type = self._get_device_kind(model_class)
                if not inferred_type:
                    logger.debug(
                        "Skipping unsupported model for %s: %s",
                        address,
                        model_class,
                    )
                    continue
                status = await self.connect_device(address, inferred_type)
                self._cache[address] = status
                logger.info("Connected to %s (%s)", address, status.device_type)
                connected_any = True
            except Exception as exc:  # pragma: no cover - runtime diagnostics
                logger.warning("Connect failed for %s: %s", address, exc)
                continue
        return connected_any

    # Command persistence methods

    def save_command(self, command_record) -> None:
        """Save a command record to persistent storage."""
        address = command_record.address
        if address not in self._commands:
            self._commands[address] = []

        # Update existing command or append new one
        command_dict = command_record.to_dict()
        existing_commands = self._commands[address]

        # Try to find existing command by ID
        for i, existing in enumerate(existing_commands):
            if existing.get("id") == command_record.id:
                existing_commands[i] = command_dict
                break
        else:
            # New command, append it
            existing_commands.append(command_dict)

            # Keep only last 50 commands per device
            if len(existing_commands) > 50:
                existing_commands[:] = existing_commands[-50:]

    def get_commands(self, address: str, limit: int = 20):
        """Get recent commands for a device."""
        commands = self._commands.get(address, [])
        return commands[-limit:] if limit else commands

    def get_command(self, address: str, command_id: str):
        """Get a specific command by ID."""
        commands = self._commands.get(address, [])
        for cmd in commands:
            if cmd.get("id") == command_id:
                return cmd
        return None
