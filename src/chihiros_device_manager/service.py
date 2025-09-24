"""Background REST service for managing Chihiros BLE devices."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass

# from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator

try:
    from bleak_retry_connector import BleakConnectionError, BleakNotFoundError
except ImportError:  # pragma: no cover - fallback if library changes

    class BleakNotFoundError(Exception):
        """Placeholder when bleak_retry_connector is unavailable."""

        pass

    class BleakConnectionError(Exception):
        """Placeholder when bleak_retry_connector is unavailable."""

        pass


if __package__ in {None, ""}:  # pragma: no cover - runtime path fallback
    # ``uvicorn service:app`` imports this module as a script, meaning the
    # relative imports below do not have a known parent package.  When that
    # happens we manually place the project ``src`` directory on ``sys.path``
    # so that imports can resolve using the absolute package name.  This keeps
    # the module usable both when the project is installed (the normal case)
    # and when it is executed directly from a source checkout.
    import importlib
    import sys

    _SRC_ROOT = Path(__file__).resolve().parent.parent
    if str(_SRC_ROOT) not in sys.path:
        sys.path.insert(0, str(_SRC_ROOT))

    _PKG_NAME = "chihiros_device_manager"
    _current_module = sys.modules.get(__name__)
    if _current_module is not None:
        sys.modules.setdefault(f"{_PKG_NAME}.service", _current_module)

    api = importlib.import_module(f"{_PKG_NAME}.api")  # noqa: E402
    doser_commands = importlib.import_module(
        f"{_PKG_NAME}.doser_commands"
    )  # noqa: E402
    _device = importlib.import_module(f"{_PKG_NAME}.device")  # noqa: E402
    _doser_status = importlib.import_module(
        f"{_PKG_NAME}.doser_status"
    )  # noqa: E402
    _light_status = importlib.import_module(
        f"{_PKG_NAME}.light_status"
    )  # noqa: E402

    Doser = _device.Doser
    LightDevice = _device.LightDevice
    get_device_from_address = _device.get_device_from_address
    PumpStatus = _doser_status.PumpStatus
    ParsedLightStatus = _light_status.ParsedLightStatus
else:
    from . import api, doser_commands
    from .device import Doser, LightDevice, get_device_from_address
    from .doser_status import PumpStatus
    from .light_status import ParsedLightStatus

STATE_PATH = Path.home() / ".chihiros_state.json"
AUTO_RECONNECT_ENV = "CHIHIROS_AUTO_RECONNECT"

# Module logger
logger = logging.getLogger("chihiros_device_manager.service")
_default_level = os.getenv("CHIHIROS_LOG_LEVEL", "INFO").upper()
if not logging.getLogger().handlers:
    # Basic, readable default formatting for development runs. If the application
    # or a test harness configures logging explicitly this will be a no-op.
    logging.basicConfig(
        level=getattr(logging, _default_level, logging.INFO),
        format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
    )

# Ensure our module logger gets at least the configured level
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


class BLEService:
    """Manages BLE devices, status cache, and persistence."""

    def __init__(self) -> None:
        """Instantiate caches, locks, and connection state.

        Keep internal references to connected devices and an in-memory cache.
        """
        self._lock = asyncio.Lock()
        self._doser: Optional[Doser] = None
        self._doser_address: Optional[str] = None
        self._light: Optional[LightDevice] = None
        self._light_address: Optional[str] = None
        self._cache: Dict[str, CachedStatus] = {}
        self._auto_reconnect = bool(int(os.getenv(AUTO_RECONNECT_ENV, "1")))

    async def start(self) -> None:
        """Initialise the service and reconnect cached devices.

        After reconnecting, the service updates the in-memory cache with
        fresh live status frames and persists the state to disk.
        """
        await self._load_state()
        logger.info("Service start: loaded %d cached devices", len(self._cache))
        if self._auto_reconnect:
            logger.info(
                "Auto-reconnect enabled; attempting reconnect to cached devices"
            )
            await self._attempt_reconnect()
            # After reconnecting, fetch live status for each device and update
            # cache/JSON
            for address, status in list(self._cache.items()):
                try:
                    logger.debug(
                        "Refreshing live status for %s (type=%s)",
                        address,
                        status.device_type,
                    )
                    if status.device_type == "doser":
                        await self._ensure_doser(address)
                        live = await self._refresh_doser_status()
                        self._cache[address] = live
                        logger.info("Refreshed doser %s", address)
                    elif status.device_type == "light":
                        await self._ensure_light(address)
                        live = await self._refresh_light_status()
                        self._cache[address] = live
                        logger.info("Refreshed light %s", address)
                except (
                    Exception
                ) as exc:  # pragma: no cover - runtime diagnostics
                    logger.warning("Failed to refresh %s: %s", address, exc)
                    continue
            await self._save_state()

    async def stop(self) -> None:
        """Persist cached state and disconnect devices."""
        await self._save_state()
        async with self._lock:
            if self._doser:
                await self._doser.disconnect()
            if self._light:
                await self._light.disconnect()

    async def connect_doser(self, address: str) -> CachedStatus:
        """Connect to a dosing pump and return its latest status."""
        await self._ensure_doser(address)
        return await self._refresh_doser_status()

    async def connect_light(self, address: str) -> CachedStatus:
        """Connect to a light and return its latest status."""
        await self._ensure_light(address)
        return await self._refresh_light_status()

    async def scan_devices(self, timeout: float = 5.0) -> list[Dict[str, Any]]:
        """Discover nearby supported devices within ``timeout`` seconds."""
        supported = await api.discover_supported_devices(timeout=timeout)
        result: list[Dict[str, Any]] = []
        for device, model_class in supported:
            if issubclass(model_class, Doser):
                device_type = "doser"
            elif issubclass(model_class, LightDevice):
                device_type = "light"
            else:
                device_type = "unknown"
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
        """Manually refresh status for the device at ``address``.

        Connect if needed, update cache and JSON. This method will attempt to
        connect even when the device is not present in the persisted cache.
        It deliberately avoids holding the service-level lock while invoking
        the connection/refresh helpers which themselves acquire the lock; that
        prevents a deadlock.
        """
        # Fast-path: if we have a cached entry, use its recorded device_type to pick
        # the correct connect/refresh routine. Do not hold the lock while performing
        # the connection/refresh since those helpers use the same lock internally.
        logger.info("Manual request_status for %s", address)
        status = self._cache.get(address)
        if not status:
            # Try to discover the device type dynamically and connect.
            try:
                device = await get_device_from_address(address)
            except Exception as exc:
                logger.warning(
                    "request_status: device not found for %s: %s", address, exc
                )
                raise HTTPException(
                    status_code=404, detail="Device not found"
                ) from exc

            if isinstance(device, Doser):
                logger.debug(
                    "request_status: identified doser at %s, ensuring connection",
                    address,
                )
                await self._ensure_doser(address)
                return await self._refresh_doser_status()
            if isinstance(device, LightDevice):
                logger.debug(
                    "request_status: identified light at %s, ensuring connection",
                    address,
                )
                await self._ensure_light(address)
                return await self._refresh_light_status()

            raise HTTPException(
                status_code=400, detail="Unsupported device type"
            )

        # Cached entry exists; refresh according to the recorded device type.
        if status.device_type == "doser":
            await self._ensure_doser(address)
            return await self._refresh_doser_status()
        if status.device_type == "light":
            await self._ensure_light(address)
            return await self._refresh_light_status()

        raise HTTPException(status_code=400, detail="Unknown device type")

    async def disconnect_device(self, address: str) -> None:
        """Disconnect the device currently registered at ``address``."""
        async with self._lock:
            if address == self._doser_address and self._doser:
                await self._doser.disconnect()
                self._doser = None
                self._doser_address = None
            elif address == self._light_address and self._light:
                await self._light.disconnect()
                self._light = None
                self._light_address = None

    def get_status_snapshot(self) -> Dict[str, CachedStatus]:
        """Return a shallow copy of the cached device status map."""
        return self._cache.copy()

    def current_doser_address(self) -> Optional[str]:
        """Return the currently connected doser address, if any."""
        return self._doser_address

    def current_light_address(self) -> Optional[str]:
        """Return the currently connected light address, if any."""
        return self._light_address

    async def _ensure_doser(self, address: str) -> Doser:
        """Ensure a doser is connected for ``address`` and return it."""
        async with self._lock:
            if self._doser and self._doser_address == address:
                return self._doser
            if self._doser:
                await self._doser.disconnect()
                self._doser = None
                self._doser_address = None
            try:
                device = await get_device_from_address(address)
            except Exception as exc:
                raise HTTPException(
                    status_code=404, detail="Dosing pump not found"
                ) from exc
            if not isinstance(device, Doser):
                raise HTTPException(
                    status_code=400, detail="Device is not a dosing pump"
                )
            self._doser = device
            self._doser_address = address
            return device

    async def _ensure_light(self, address: str) -> LightDevice:
        """Ensure a light is connected for ``address`` and return it."""
        async with self._lock:
            if self._light and self._light_address == address:
                return self._light
            if self._light:
                await self._light.disconnect()
                self._light = None
                self._light_address = None
            try:
                device = await get_device_from_address(address)
            except Exception as exc:
                raise HTTPException(
                    status_code=404, detail="Light not found"
                ) from exc
            if not isinstance(device, LightDevice):
                raise HTTPException(
                    status_code=400, detail="Device is not a supported light"
                )
            self._light = device
            self._light_address = address
            return device

    async def set_doser_schedule(
        self,
        address: str,
        *,
        head_index: int,
        volume_tenths_ml: int,
        hour: int,
        minute: int,
        weekdays: Sequence[doser_commands.Weekday] | None = None,
        confirm: bool = False,
        wait_seconds: float = 1.5,
    ) -> CachedStatus:
        """Apply a dosing schedule and return the refreshed cached status."""
        device = await self._ensure_doser(address)
        try:
            await device.set_daily_dose(
                head_index,
                volume_tenths_ml,
                hour,
                minute,
                weekdays=weekdays,
                confirm=confirm,
                wait_seconds=wait_seconds,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except (BleakNotFoundError, BleakConnectionError) as exc:
            raise HTTPException(
                status_code=404, detail="Dosing pump not reachable"
            ) from exc
        return await self._refresh_doser_status()

    async def set_light_brightness(
        self, address: str, *, brightness: int, color: str | int = 0
    ) -> CachedStatus:
        """Set brightness for ``address`` and return the cached status."""
        device = await self._ensure_light(address)
        try:
            target_color: str | int = color
            if isinstance(target_color, str):
                stripped = target_color.strip()
                if stripped.isdigit():
                    target_color = int(stripped)
                else:
                    target_color = stripped
            await device.set_color_brightness(brightness, target_color)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except (BleakNotFoundError, BleakConnectionError) as exc:
            raise HTTPException(
                status_code=404, detail="Light not reachable"
            ) from exc
        return await self._refresh_light_status()

    async def turn_light_on(self, address: str) -> CachedStatus:
        """Switch the light on and refresh cached status."""
        device = await self._ensure_light(address)
        try:
            await device.turn_on()
        except (BleakNotFoundError, BleakConnectionError) as exc:
            raise HTTPException(
                status_code=404, detail="Light not reachable"
            ) from exc
        return await self._refresh_light_status()

    async def turn_light_off(self, address: str) -> CachedStatus:
        """Switch the light off and refresh cached status."""
        device = await self._ensure_light(address)
        try:
            await device.turn_off()
        except (BleakNotFoundError, BleakConnectionError) as exc:
            raise HTTPException(
                status_code=404, detail="Light not reachable"
            ) from exc
        return await self._refresh_light_status()

    async def _refresh_doser_status(self) -> CachedStatus:
        """Request and cache the latest doser status."""
        return await self._capture_doser_status(persist=True)

    async def _refresh_light_status(self) -> CachedStatus:
        """Request and cache the latest light status."""
        return await self._capture_light_status(persist=True)

    async def _capture_doser_status(self, persist: bool) -> CachedStatus:
        """Fetch the latest doser status, optionally persisting it."""
        async with self._lock:
            if not self._doser or not self._doser_address:
                raise HTTPException(
                    status_code=400, detail="Doser not connected"
                )
            try:
                logger.debug(
                    "Requesting doser status from %s", self._doser_address
                )
                await self._doser.request_status()
            except (BleakNotFoundError, BleakConnectionError) as exc:
                logger.warning(
                    "Doser not reachable %s: %s", self._doser_address, exc
                )
                raise HTTPException(
                    status_code=404, detail="Dosing pump not reachable"
                ) from exc
            await asyncio.sleep(1.5)
            status = self._doser.last_status
            if not status:
                raise HTTPException(
                    status_code=500, detail="No status received from doser"
                )
            # The Doser now provides a canonical parsed PumpStatus in
            # `last_status` (set by its notification handler). Use that
            # parsed object directly for the API snapshot; the service no
            # longer performs any fragment merging or lifetime counter
            # extraction.
            parsed = _serialize_pump_status(status)
            cached = CachedStatus(
                address=self._doser_address,
                device_type="doser",
                # Keep raw_payload as the most recent packet for
                # compatibility; parsed contains the merged logical view.
                raw_payload=status.raw_payload.hex(),
                parsed=parsed,
                updated_at=time.time(),
                model_name=getattr(self._doser, "model_name", None),
            )
            if persist:
                self._cache[self._doser_address] = cached
        if persist:
            await self._save_state()
        return cached

    async def _capture_light_status(self, persist: bool) -> CachedStatus:
        """Fetch the latest light status, optionally persisting it."""
        async with self._lock:
            if not self._light or not self._light_address:
                raise HTTPException(
                    status_code=400, detail="Light not connected"
                )
            try:
                logger.debug(
                    "Requesting light status from %s", self._light_address
                )
                await self._light.request_status()
            except (BleakNotFoundError, BleakConnectionError) as exc:
                logger.warning(
                    "Light not reachable %s: %s", self._light_address, exc
                )
                raise HTTPException(
                    status_code=404, detail="Light not reachable"
                ) from exc
            await asyncio.sleep(1.5)
            status = self._light.last_status
            if not status:
                raise HTTPException(
                    status_code=500, detail="No status received from light"
                )
            # The device now supplies a ParsedLightStatus for `last_status`.
            # Use it directly to avoid duplicate parsing and maintain a
            # single canonical parsing path.
            parsed = _serialize_light_status(status)
            cached = CachedStatus(
                address=self._light_address,
                device_type="light",
                raw_payload=status.raw_payload.hex(),
                parsed=parsed,
                updated_at=time.time(),
                model_name=getattr(self._light, "model_name", None),
            )
            if persist:
                self._cache[self._light_address] = cached
        if persist:
            await self._save_state()
        return cached

    async def get_live_statuses(self) -> tuple[list[CachedStatus], list[str]]:
        """Request live status frames without updating persistent storage."""
        results: list[CachedStatus] = []
        errors: list[str] = []

        for collector in (
            self._capture_doser_status,
            self._capture_light_status,
        ):
            try:
                status = await collector(persist=False)
            except HTTPException as exc:
                if exc.status_code == 400:
                    continue
                errors.append(str(exc.detail))
            else:
                results.append(status)

        return results, errors

    async def _load_state(self) -> None:
        """Load cached state from ``STATE_PATH`` if present."""
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
            )
        self._cache = cache

    async def _save_state(self) -> None:
        """Write the current cache to ``STATE_PATH``."""
        data = {
            "devices": {
                address: {
                    "device_type": status.device_type,
                    "raw_payload": status.raw_payload,
                    "parsed": status.parsed,
                    "updated_at": status.updated_at,
                    "model_name": status.model_name,
                }
                for address, status in self._cache.items()
            }
        }
        STATE_PATH.write_text(json.dumps(data, indent=2, sort_keys=True))

    async def _attempt_reconnect(self) -> None:
        """Reconnect to previously cached devices when auto reconnect is on."""
        if self._cache:
            for address, status in list(self._cache.items()):
                try:
                    logger.info(
                        "Attempting reconnect to %s (type=%s)",
                        address,
                        status.device_type,
                    )
                    if status.device_type == "doser":
                        await self.connect_doser(address)
                    elif status.device_type == "light":
                        await self.connect_light(address)
                except HTTPException as exc:
                    logger.warning(
                        "Reconnect failed for %s: %s",
                        address,
                        getattr(exc, "detail", exc),
                    )
                    continue


def _serialize_pump_status(status: PumpStatus) -> Dict[str, Any]:
    """Convert a pump status dataclass into JSON-safe primitives."""
    data = asdict(status)
    # raw_payload and tail_raw are bytes; convert them to hex strings for JSON.
    data["raw_payload"] = (
        status.raw_payload.hex()
        if getattr(status, "raw_payload", None)
        else None
    )
    data["tail_raw"] = status.tail_raw.hex()
    for head in data["heads"]:
        head["extra"] = bytes(head["extra"]).hex()
    return data


def _serialize_light_status(status: ParsedLightStatus) -> Dict[str, Any]:
    """Convert a light status snapshot to a serializable dictionary."""
    data = {
        "message_id": status.message_id,
        "response_mode": status.response_mode,
        "weekday": status.weekday,
        "current_hour": status.current_hour,
        "current_minute": status.current_minute,
        # Include both the raw value (0..255) and a pre-computed percentage so the
        # frontend doesn't need to perform the conversion. Keep the original
        # fields for backward compatibility.
        "keyframes": [
            # Some firmware variants encode brightness as 0..255 (8-bit) while
            # others use a 0..100 scale.  If the value is <= 100 we assume it's
            # already a percentage and preserve it; otherwise scale from 0..255
            # into 0..100 for convenience in the frontend.
            {
                **asdict(frame),
                "percent": (
                    int(round(frame.value))
                    if frame.value is not None and frame.value <= 100
                    else int(round((frame.value / 255) * 100))
                ),
            }
            for frame in status.keyframes
        ],
        "time_markers": status.time_markers,
        "tail": status.tail.hex(),
        # Preserve the original raw payload bytes for parity with pump
        # serialization. The frontend or diagnostic tooling may rely on
        # this to show the raw frame that produced the parsed view.
        "raw_payload": status.raw_payload.hex(),
    }
    return data


def _cached_status_to_dict(status: CachedStatus) -> Dict[str, Any]:
    """Transform a cached status into the API response structure."""
    # Determine whether the service currently holds a live connection for this
    # cached address.  This enables the frontend to show a connected/disconnected
    # indicator and offer a reconnect action.
    connected = False
    if status.device_type == "doser":
        connected = service.current_doser_address() == status.address
    elif status.device_type == "light":
        connected = service.current_light_address() == status.address

    return {
        "address": status.address,
        "device_type": status.device_type,
        "raw_payload": status.raw_payload,
        "parsed": status.parsed,
        "updated_at": status.updated_at,
        "model_name": status.model_name,
        "connected": connected,
    }


service = BLEService()
app = FastAPI(title="Chihiros BLE Service")

PACKAGE_ROOT = Path(__file__).resolve().parent
DEFAULT_FRONTEND_DIST = PACKAGE_ROOT.parent.parent / "frontend" / "dist"
FRONTEND_DIST = Path(
    os.getenv("CHIHIROS_FRONTEND_DIST", str(DEFAULT_FRONTEND_DIST))
)
SPA_DIST_AVAILABLE = FRONTEND_DIST.exists()

SPA_UNAVAILABLE_MESSAGE = (
    "The TypeScript dashboard is unavailable. "
    "Build the SPA (npm run build) or start the dev server (npm run dev) "
    "before visiting '/' again."
)

ARCHIVED_TEMPLATE_MESSAGE = (
    "The legacy HTMX dashboard has been retired. Switch to the SPA at '/' "
    "or use the REST API under /api/*."
)

_DEV_SERVER_ENV = os.getenv("CHIHIROS_FRONTEND_DEV_SERVER", "").strip()
if _DEV_SERVER_ENV == "0":
    DEV_SERVER_CANDIDATES: tuple[httpx.URL, ...] = ()
elif _DEV_SERVER_ENV:
    DEV_SERVER_CANDIDATES = (httpx.URL(_DEV_SERVER_ENV.rstrip("/")),)
else:
    DEV_SERVER_CANDIDATES = (
        httpx.URL("http://127.0.0.1:5173"),
        httpx.URL("http://localhost:5173"),
    )

DEV_SERVER_TIMEOUT = httpx.Timeout(connect=1.0, read=5.0, write=5.0, pool=1.0)
_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
}

if SPA_DIST_AVAILABLE:
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="spa-assets",
        )


class ConnectRequest(BaseModel):
    """Payload for connecting a device to the service."""

    address: str


class DoserScheduleRequest(BaseModel):
    """Request model for updating or creating a dosing schedule."""

    head_index: int = Field(..., ge=0, le=3)
    volume_tenths_ml: int = Field(..., ge=0, le=0xFF)
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(..., ge=0, le=59)
    weekdays: list[doser_commands.Weekday] | None = None
    confirm: bool = False
    wait_seconds: float = Field(1.5, ge=0.0, le=30.0)

    @validator("weekdays", pre=True)
    def _normalize_weekdays(cls, value: Any) -> Any:
        if value is None or value == []:
            return None
        if isinstance(value, doser_commands.Weekday):
            return [value]
        if isinstance(value, (str, int)):
            value = [value]
        if isinstance(value, (set, tuple)):
            value = list(value)
        if isinstance(value, list):
            parsed: list[doser_commands.Weekday] = []
            for item in value:
                if isinstance(item, doser_commands.Weekday):
                    parsed.append(item)
                    continue
                if isinstance(item, str):
                    name = item.strip().lower()
                    try:
                        parsed.append(getattr(doser_commands.Weekday, name))
                        continue
                    except AttributeError as exc:
                        raise ValueError(f"Unknown weekday '{item}'") from exc
                if isinstance(item, int):
                    try:
                        parsed.append(doser_commands.Weekday(item))
                        continue
                    except ValueError as exc:
                        raise ValueError(
                            f"Invalid weekday value '{item}'"
                        ) from exc
                raise ValueError(
                    "Weekday entries must be strings, integers, or "
                    "Weekday enum values"
                )
            return parsed
        raise ValueError("Weekdays must be provided as a sequence")


class LightBrightnessRequest(BaseModel):
    """Request model for setting light brightness or colour."""

    brightness: int = Field(..., ge=0, le=100)
    color: str | int = 0


@app.get("/", response_class=HTMLResponse)
async def serve_spa() -> Response:
    """Serve the SPA entry point or emit guidance when it is unavailable."""
    if SPA_DIST_AVAILABLE:
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return HTMLResponse(index_path.read_text(encoding="utf-8"))
    proxied = await _proxy_dev_server("/")
    if proxied is not None:
        return proxied
    return Response(
        SPA_UNAVAILABLE_MESSAGE,
        status_code=503,
        media_type="text/plain",
        headers={"cache-control": "no-store"},
    )


@app.on_event("startup")
async def on_startup() -> None:
    """Initialise the BLE service when FastAPI boots."""
    await service.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Tear down BLE connections during application shutdown."""
    await service.stop()


@app.get("/api/status")
async def get_status() -> Dict[str, Any]:
    """Return cached status for all devices, without connecting or refreshing."""
    snapshot = service.get_status_snapshot()
    results = {}
    for address, cached in snapshot.items():
        results[address] = _cached_status_to_dict(cached)
    return results


@app.post("/api/debug/live-status")
async def debug_live_status() -> Dict[str, Any]:
    """Expose live payloads without updating the persisted cache."""
    statuses, errors = await service.get_live_statuses()
    return {
        "statuses": [_cached_status_to_dict(status) for status in statuses],
        "errors": errors,
    }


@app.get("/api/scan")
async def scan_devices(timeout: float = 5.0) -> list[Dict[str, Any]]:
    """Discover nearby supported devices and expose metadata."""
    return await service.scan_devices(timeout=timeout)


@app.post("/api/dosers/connect")
async def connect_doser(request: ConnectRequest) -> Dict[str, Any]:
    """Connect to a dosing pump and return its status payload."""
    status = await service.connect_doser(request.address)
    return _cached_status_to_dict(status)


@app.post("/api/lights/connect")
async def connect_light(request: ConnectRequest) -> Dict[str, Any]:
    """Connect to a light fixture and return its cached status."""
    status = await service.connect_light(request.address)
    return _cached_status_to_dict(status)


@app.post("/api/devices/{address}/status")
async def refresh_status(address: str) -> Dict[str, Any]:
    """Request a fresh status frame for the connected device."""
    status = await service.request_status(address)
    return _cached_status_to_dict(status)


@app.post("/api/devices/{address}/connect")
async def reconnect_device(address: str) -> Dict[str, Any]:
    """Attempt to (re)connect to a device and return its cached status.

    The endpoint will attempt to use the cache to determine the device type; if the
    address is not in the cache it will attempt discovery and connect accordingly.
    """
    # Try to use cached device_type first
    cached = service.get_status_snapshot().get(address)
    if cached:
        if cached.device_type == "doser":
            status = await service.connect_doser(address)
            return _cached_status_to_dict(status)
        if cached.device_type == "light":
            status = await service.connect_light(address)
            return _cached_status_to_dict(status)

    # Fall back to discovery-based connect
    try:
        device = await get_device_from_address(address)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Device not found") from exc

    if isinstance(device, Doser):
        status = await service.connect_doser(address)
        return _cached_status_to_dict(status)
    if isinstance(device, LightDevice):
        status = await service.connect_light(address)
        return _cached_status_to_dict(status)

    raise HTTPException(status_code=400, detail="Unsupported device type")


@app.post("/api/dosers/{address}/schedule")
async def set_doser_schedule(
    address: str, payload: DoserScheduleRequest
) -> Dict[str, Any]:
    """Apply a schedule update via the REST API and return the cache."""
    status = await service.set_doser_schedule(
        address,
        head_index=payload.head_index,
        volume_tenths_ml=payload.volume_tenths_ml,
        hour=payload.hour,
        minute=payload.minute,
        weekdays=payload.weekdays,
        confirm=payload.confirm,
        wait_seconds=payload.wait_seconds,
    )
    return _cached_status_to_dict(status)


@app.post("/api/lights/{address}/brightness")
async def set_light_brightness(
    address: str, payload: LightBrightnessRequest
) -> Dict[str, Any]:
    """Set light brightness via the REST API and return cached state."""
    status = await service.set_light_brightness(
        address,
        brightness=payload.brightness,
        color=payload.color,
    )
    return _cached_status_to_dict(status)


@app.post("/api/lights/{address}/on")
async def turn_light_on(address: str) -> Dict[str, Any]:
    """Turn on a connected light through the REST interface."""
    status = await service.turn_light_on(address)
    return _cached_status_to_dict(status)


@app.post("/api/lights/{address}/off")
async def turn_light_off(address: str) -> Dict[str, Any]:
    """Turn off a connected light through the REST interface."""
    status = await service.turn_light_off(address)
    return _cached_status_to_dict(status)


@app.post("/api/devices/{address}/disconnect")
async def disconnect_device(address: str) -> Dict[str, str]:
    """Disconnect whichever device is currently registered at ``address``."""
    await service.disconnect_device(address)
    return {"detail": "disconnected"}


@app.api_route(
    "/ui{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def legacy_ui_archived(path: str = "") -> Response:
    """Return a 410 response for retired HTMX routes."""
    return Response(
        ARCHIVED_TEMPLATE_MESSAGE,
        status_code=410,
        media_type="text/plain",
        headers={"cache-control": "no-store"},
    )


@app.api_route(
    "/debug{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def legacy_debug_archived(path: str = "") -> Response:
    """Indicate that debug template routes are no longer served."""
    return Response(
        ARCHIVED_TEMPLATE_MESSAGE,
        status_code=410,
        media_type="text/plain",
        headers={"cache-control": "no-store"},
    )


@app.get("/{spa_path:path}", include_in_schema=False)
async def serve_spa_assets(spa_path: str) -> Response:
    """Serve built SPA assets or fallback to the index for client routes."""
    if not spa_path:
        raise HTTPException(status_code=404)

    first_segment = spa_path.split("/", 1)[0]
    if first_segment in {"api", "ui", "debug"} or spa_path in {
        "docs",
        "redoc",
        "openapi.json",
    }:
        raise HTTPException(status_code=404)

    if not SPA_DIST_AVAILABLE:
        proxied = await _proxy_dev_server(f"/{spa_path}")
        if proxied is not None:
            return proxied
        raise HTTPException(status_code=404, detail="SPA bundle unavailable")

    asset_path = FRONTEND_DIST / spa_path
    if asset_path.is_file():
        return FileResponse(asset_path)

    if "." in spa_path:
        raise HTTPException(status_code=404)

    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))

    raise HTTPException(status_code=404)


async def _proxy_dev_server(path: str) -> Response | None:
    """Attempt to fetch ``path`` from the Vite dev server if available."""
    if not DEV_SERVER_CANDIDATES:
        return None

    normalized = path if path.startswith("/") else f"/{path}"

    for base_url in DEV_SERVER_CANDIDATES:
        try:
            async with httpx.AsyncClient(
                base_url=str(base_url), timeout=DEV_SERVER_TIMEOUT
            ) as client:
                response = await client.get(normalized, follow_redirects=True)
        except httpx.HTTPError:
            continue

        headers = {
            key: value
            for key, value in response.headers.items()
            if key.lower() not in _HOP_HEADERS
        }
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=headers,
        )

    return None


def main() -> None:  # pragma: no cover - thin CLI wrapper
    """Run the FastAPI service under Uvicorn."""
    import uvicorn

    host = os.getenv("CHIHIROS_SERVICE_HOST", "0.0.0.0")
    port = int(os.getenv("CHIHIROS_SERVICE_PORT", "8000"))

    uvicorn.run(
        "chihiros_device_manager.service:app",
        host=host,
        port=port,
    )


if __name__ == "__main__":  # pragma: no cover
    main()
