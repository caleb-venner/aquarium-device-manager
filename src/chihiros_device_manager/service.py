"""Background REST service for managing Chihiros BLE devices."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass

# from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, Response

# Pydantic models have been moved to schemas.py; no direct import here.

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
    _serializers = importlib.import_module(
        f"{_PKG_NAME}.serializers"
    )  # noqa: E402
    _schemas = importlib.import_module(f"{_PKG_NAME}.schemas")  # noqa: E402
    _routes_devices = importlib.import_module(
        f"{_PKG_NAME}.api.routes_devices"
    )  # noqa: E402
    _routes_dosers = importlib.import_module(
        f"{_PKG_NAME}.api.routes_dosers"
    )  # noqa: E402
    _routes_lights = importlib.import_module(
        f"{_PKG_NAME}.api.routes_lights"
    )  # noqa: E402
    _spa = importlib.import_module(f"{_PKG_NAME}.spa")  # noqa: E402

    Doser = _device.Doser
    LightDevice = _device.LightDevice
    get_device_from_address = _device.get_device_from_address
    PumpStatus = _doser_status.PumpStatus
    ParsedLightStatus = _light_status.ParsedLightStatus
    _serialize_pump_status = _serializers._serialize_pump_status
    _serialize_light_status = _serializers._serialize_light_status
    cached_status_to_dict = _serializers.cached_status_to_dict
    # Re-export request models for backwards compatibility in tests
    ConnectRequest = _schemas.ConnectRequest
    DoserScheduleRequest = _schemas.DoserScheduleRequest
    LightBrightnessRequest = _schemas.LightBrightnessRequest
    devices_router = _routes_devices.router
    dosers_router = _routes_dosers.router
    lights_router = _routes_lights.router
    spa = _spa
else:
    from . import api, doser_commands, spa
    from .api.routes_devices import router as devices_router
    from .api.routes_dosers import router as dosers_router
    from .api.routes_lights import router as lights_router
    from .device import Doser, LightDevice, get_device_from_address

    # Re-export request models for backwards compatibility in tests
    from .schemas import (
        ConnectRequest,
        DoserScheduleRequest,
        LightBrightnessRequest,
    )
    from .serializers import (
        _serialize_light_status,
        _serialize_pump_status,
        cached_status_to_dict,
    )

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


# Serializers were moved to `serializers.py` and used by API routers.


service = BLEService()
app = FastAPI(title="Chihiros BLE Service")
# Expose service to routers via application state
app.state.service = service

ARCHIVED_TEMPLATE_MESSAGE = (
    "The legacy HTMX dashboard has been retired. Switch to the SPA at '/' "
    "or use the REST API under /api/*."
)
# Back-compat constants and helpers for tests
SPA_UNAVAILABLE_MESSAGE = getattr(spa, "SPA_UNAVAILABLE_MESSAGE")
SPA_DIST_AVAILABLE = getattr(spa, "SPA_DIST_AVAILABLE")
FRONTEND_DIST = getattr(spa, "FRONTEND_DIST")


async def _proxy_dev_server(path: str) -> Response | None:
    return await spa._proxy_dev_server(path)


"""Mount SPA assets via helper module."""
spa.mount_assets(app)


@app.get("/", response_class=HTMLResponse)
async def serve_spa() -> Response:
    """Serve SPA index or proxy to dev server; mirrors legacy behavior for tests."""
    # Use local constants to support monkeypatching in tests
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


"""Include API routers for devices, dosers, and lights."""
app.include_router(devices_router)
app.include_router(dosers_router)
app.include_router(lights_router)


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
    """Serve SPA assets or proxy; mirrors legacy behavior for tests."""
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
        # FileResponse takes a path; FastAPI will set .path attribute for tests
        from fastapi.responses import FileResponse as _FileResponse

        return _FileResponse(asset_path)
    if "." in spa_path:
        raise HTTPException(status_code=404)
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404)


async def debug_live_status() -> Dict[str, Any]:
    """Expose live payloads without updating persisted cache (test helper)."""
    statuses, errors = await service.get_live_statuses()
    return {
        "statuses": [cached_status_to_dict(service, s) for s in statuses],
        "errors": errors,
    }


async def set_doser_schedule(
    address: str, payload: "DoserScheduleRequest"
) -> Dict[str, Any]:
    """Back-compat endpoint wrapper used by tests."""
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
    return cached_status_to_dict(service, status)


async def set_light_brightness(
    address: str, payload: "LightBrightnessRequest"
) -> Dict[str, Any]:
    """Back-compat endpoint wrapper used by tests."""
    status = await service.set_light_brightness(
        address,
        brightness=payload.brightness,
        color=payload.color,
    )
    return cached_status_to_dict(service, status)


"""Proxy logic moved to spa helper module."""


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
