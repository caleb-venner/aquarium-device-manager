"""Background REST service for managing Chihiros BLE devices."""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, ValidationError, validator

try:
    from bleak_retry_connector import BleakConnectionError, BleakNotFoundError
except ImportError:  # pragma: no cover - fallback if library changes

    class BleakNotFoundError(Exception):
        """Placeholder when bleak_retry_connector is unavailable."""

        pass

    class BleakConnectionError(Exception):
        """Placeholder when bleak_retry_connector is unavailable."""

        pass


from . import api, doser_commands
from .device import Doser, LightDevice, get_device_from_address
from .doser_status import PumpStatus, parse_status_payload
from .light_status import ParsedLightStatus, parse_light_status

STATE_PATH = Path.home() / ".chihiros_state.json"
AUTO_RECONNECT_ENV = "CHIHIROS_AUTO_RECONNECT"


@dataclass(slots=True)
class CachedStatus:
    """Serialized snapshot for persistence."""

    address: str
    device_type: str
    raw_payload: str | None
    parsed: Dict[str, Any] | None
    updated_at: float


class BLEService:
    """Manages BLE devices, status cache, and persistence."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._doser: Optional[Doser] = None
        self._doser_address: Optional[str] = None
        self._light: Optional[LightDevice] = None
        self._light_address: Optional[str] = None
        self._cache: Dict[str, CachedStatus] = {}
        self._auto_reconnect = bool(int(os.getenv(AUTO_RECONNECT_ENV, "1")))

    async def start(self) -> None:
        await self._load_state()
        if self._auto_reconnect:
            await self._attempt_reconnect()

    async def stop(self) -> None:
        await self._save_state()
        async with self._lock:
            if self._doser:
                await self._doser.disconnect()
            if self._light:
                await self._light.disconnect()

    async def connect_doser(self, address: str) -> CachedStatus:
        await self._ensure_doser(address)
        return await self._refresh_doser_status()

    async def connect_light(self, address: str) -> CachedStatus:
        await self._ensure_light(address)
        return await self._refresh_light_status()

    async def scan_devices(self, timeout: float = 5.0) -> list[Dict[str, Any]]:
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
        target: Optional[str] = None
        async with self._lock:
            if address == self._doser_address and self._doser:
                target = "doser"
            elif address == self._light_address and self._light:
                target = "light"
            else:
                raise HTTPException(
                    status_code=404, detail="Device not connected"
                )

        if target == "doser":
            return await self._refresh_doser_status()
        if target == "light":
            return await self._refresh_light_status()
        raise HTTPException(status_code=404, detail="Device not connected")

    async def disconnect_device(self, address: str) -> None:
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
        return self._cache.copy()

    def current_doser_address(self) -> Optional[str]:
        return self._doser_address

    def current_light_address(self) -> Optional[str]:
        return self._light_address

    async def _ensure_doser(self, address: str) -> Doser:
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
        device = await self._ensure_light(address)
        try:
            await device.turn_on()
        except (BleakNotFoundError, BleakConnectionError) as exc:
            raise HTTPException(
                status_code=404, detail="Light not reachable"
            ) from exc
        return await self._refresh_light_status()

    async def turn_light_off(self, address: str) -> CachedStatus:
        device = await self._ensure_light(address)
        try:
            await device.turn_off()
        except (BleakNotFoundError, BleakConnectionError) as exc:
            raise HTTPException(
                status_code=404, detail="Light not reachable"
            ) from exc
        return await self._refresh_light_status()

    async def _refresh_doser_status(self) -> CachedStatus:
        async with self._lock:
            if not self._doser or not self._doser_address:
                raise HTTPException(
                    status_code=400, detail="Doser not connected"
                )
            try:
                await self._doser.request_status()
            except (BleakNotFoundError, BleakConnectionError) as exc:
                raise HTTPException(
                    status_code=404, detail="Dosing pump not reachable"
                ) from exc
            await asyncio.sleep(1.5)
            status = self._doser.last_status
            if not status:
                raise HTTPException(
                    status_code=500, detail="No status received from doser"
                )
            parsed = _serialize_pump_status(
                parse_status_payload(status.raw_payload)
            )
            cached = CachedStatus(
                address=self._doser_address,
                device_type="doser",
                raw_payload=status.raw_payload.hex(),
                parsed=parsed,
                updated_at=time.time(),
            )
            self._cache[self._doser_address] = cached
        await self._save_state()
        return cached

    async def _refresh_light_status(self) -> CachedStatus:
        async with self._lock:
            if not self._light or not self._light_address:
                raise HTTPException(
                    status_code=400, detail="Light not connected"
                )
            try:
                await self._light.request_status()
            except (BleakNotFoundError, BleakConnectionError) as exc:
                raise HTTPException(
                    status_code=404, detail="Light not reachable"
                ) from exc
            await asyncio.sleep(1.5)
            status = self._light.last_status
            if not status:
                raise HTTPException(
                    status_code=500, detail="No status received from light"
                )
            parsed = _serialize_light_status(
                parse_light_status(status.raw_payload)
            )
            cached = CachedStatus(
                address=self._light_address,
                device_type="light",
                raw_payload=status.raw_payload.hex(),
                parsed=parsed,
                updated_at=time.time(),
            )
            self._cache[self._light_address] = cached
        await self._save_state()
        return cached

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
            )
        self._cache = cache

    async def _save_state(self) -> None:
        data = {
            "devices": {
                address: {
                    "device_type": status.device_type,
                    "raw_payload": status.raw_payload,
                    "parsed": status.parsed,
                    "updated_at": status.updated_at,
                }
                for address, status in self._cache.items()
            }
        }
        STATE_PATH.write_text(json.dumps(data, indent=2, sort_keys=True))

    async def _attempt_reconnect(self) -> None:
        if self._cache:
            for address, status in self._cache.items():
                try:
                    if status.device_type == "doser":
                        await self.connect_doser(address)
                    elif status.device_type == "light":
                        await self.connect_light(address)
                except HTTPException:
                    continue


def _serialize_pump_status(status: PumpStatus) -> Dict[str, Any]:
    data = asdict(status)
    data["tail_raw"] = status.tail_raw.hex()
    for head in data["heads"]:
        head["extra"] = bytes(head["extra"]).hex()
    return data


def _serialize_light_status(status: ParsedLightStatus) -> Dict[str, Any]:
    data = {
        "message_id": status.message_id,
        "response_mode": status.response_mode,
        "weekday": status.weekday,
        "current_hour": status.current_hour,
        "current_minute": status.current_minute,
        "keyframes": [asdict(frame) for frame in status.keyframes],
        "time_markers": status.time_markers,
        "tail": status.tail.hex(),
    }
    return data


def _cached_status_to_dict(status: CachedStatus) -> Dict[str, Any]:
    return {
        "address": status.address,
        "device_type": status.device_type,
        "raw_payload": status.raw_payload,
        "parsed": status.parsed,
        "updated_at": status.updated_at,
    }


def _format_timestamp(value: float | None) -> str:
    if not value:
        return "—"
    try:
        return datetime.fromtimestamp(value).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)


service = BLEService()
app = FastAPI(title="Chihiros BLE Service")
templates = Jinja2Templates(
    directory=str(Path(__file__).resolve().parent / "templates")
)


class ConnectRequest(BaseModel):
    address: str


class DoserScheduleRequest(BaseModel):
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
    brightness: int = Field(..., ge=0, le=100)
    color: str | int = 0


@app.on_event("startup")
async def on_startup() -> None:
    await service.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await service.stop()


@app.get("/api/status")
async def get_status() -> Dict[str, Any]:
    return {
        address: {
            "device_type": status.device_type,
            "raw_payload": status.raw_payload,
            "parsed": status.parsed,
            "updated_at": status.updated_at,
        }
        for address, status in service.get_status_snapshot().items()
    }


@app.get("/api/scan")
async def scan_devices(timeout: float = 5.0) -> list[Dict[str, Any]]:
    return await service.scan_devices(timeout=timeout)


@app.get("/ui", response_class=HTMLResponse)
async def ui_dashboard(request: Request) -> HTMLResponse:
    snapshot = service.get_status_snapshot()
    doser_address = service.current_doser_address()
    light_address = service.current_light_address()
    doser_status = (
        _cached_status_to_dict(snapshot[doser_address])
        if doser_address and doser_address in snapshot
        else None
    )
    light_status = (
        _cached_status_to_dict(snapshot[light_address])
        if light_address and light_address in snapshot
        else None
    )
    context = {
        "request": request,
        "snapshot": snapshot,
        "doser_status": doser_status,
        "light_status": light_status,
        "doser_error": None,
        "light_error": None,
        "doser_message": None,
        "light_message": None,
        "doser_address": doser_address,
        "light_address": light_address,
        "format_ts": _format_timestamp,
    }
    return templates.TemplateResponse("dashboard.html", context)


@app.get("/ui/scan", response_class=HTMLResponse)
async def ui_scan(request: Request, timeout: float = 5.0) -> HTMLResponse:
    devices = await service.scan_devices(timeout=timeout)
    return templates.TemplateResponse(
        "partials/scan_results.html",
        {"request": request, "devices": devices},
    )


@app.post("/api/dosers/connect")
async def connect_doser(request: ConnectRequest) -> Dict[str, Any]:
    status = await service.connect_doser(request.address)
    return _cached_status_to_dict(status)


@app.post("/ui/doser/connect", response_class=HTMLResponse)
async def ui_doser_connect(
    request: Request, address: str = Form(...)
) -> HTMLResponse:
    status_code = 200
    try:
        status = await service.connect_doser(address)
        context = {
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": f"Connected to {address}",
        }
    except HTTPException as exc:
        context = {"status": None, "error": exc.detail, "message": None}
    context["request"] = request
    return templates.TemplateResponse(
        "partials/doser_status.html", context, status_code=status_code
    )


@app.post("/api/lights/connect")
async def connect_light(request: ConnectRequest) -> Dict[str, Any]:
    status = await service.connect_light(request.address)
    return _cached_status_to_dict(status)


@app.post("/ui/light/connect", response_class=HTMLResponse)
async def ui_light_connect(
    request: Request, address: str = Form(...)
) -> HTMLResponse:
    status_code = 200
    try:
        status = await service.connect_light(address)
        context = {
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": f"Connected to {address}",
        }
    except HTTPException as exc:
        context = {"status": None, "error": exc.detail, "message": None}
    context["request"] = request
    return templates.TemplateResponse(
        "partials/light_status.html", context, status_code=status_code
    )


@app.post("/api/devices/{address}/status")
async def refresh_status(address: str) -> Dict[str, Any]:
    status = await service.request_status(address)
    return _cached_status_to_dict(status)


@app.post("/api/dosers/{address}/schedule")
async def set_doser_schedule(
    address: str, payload: DoserScheduleRequest
) -> Dict[str, Any]:
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
    status = await service.set_light_brightness(
        address,
        brightness=payload.brightness,
        color=payload.color,
    )
    return _cached_status_to_dict(status)


@app.post("/api/lights/{address}/on")
async def turn_light_on(address: str) -> Dict[str, Any]:
    status = await service.turn_light_on(address)
    return _cached_status_to_dict(status)


@app.post("/api/lights/{address}/off")
async def turn_light_off(address: str) -> Dict[str, Any]:
    status = await service.turn_light_off(address)
    return _cached_status_to_dict(status)


@app.post("/ui/doser/schedule", response_class=HTMLResponse)
async def ui_doser_schedule(request: Request) -> HTMLResponse:
    form = await request.form()
    address = (
        form.get("address") or ""
    ).strip() or service.current_doser_address()
    status_code = 200
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No dosing pump connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/doser_status.html", context, status_code=400
        )

    try:
        payload = DoserScheduleRequest(
            head_index=int(form.get("head_index", 0)),
            volume_tenths_ml=int(form.get("volume_tenths_ml", 0)),
            hour=int(form.get("hour", 0)),
            minute=int(form.get("minute", 0)),
            weekdays=form.getlist("weekdays") or None,
            confirm=bool(form.get("confirm")),
            wait_seconds=1.5,
        )
    except (ValueError, ValidationError) as exc:
        context = {
            "request": request,
            "status": None,
            "error": str(exc),
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/doser_status.html", context, status_code=400
        )

    try:
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
        context = {
            "request": request,
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": "Schedule updated.",
        }
    except HTTPException as exc:
        context = {
            "request": request,
            "status": None,
            "error": exc.detail,
            "message": None,
        }
        status_code = exc.status_code
    return templates.TemplateResponse(
        "partials/doser_status.html", context, status_code=status_code
    )


@app.post("/ui/light/brightness", response_class=HTMLResponse)
async def ui_light_brightness(request: Request) -> HTMLResponse:
    form = await request.form()
    address = (
        form.get("address") or ""
    ).strip() or service.current_light_address()
    status_code = 200
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No light connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/light_status.html", context, status_code=400
        )

    try:
        payload = LightBrightnessRequest(
            brightness=int(form.get("brightness", 0)),
            color=form.get("color", 0),
        )
    except (ValueError, ValidationError) as exc:
        context = {
            "request": request,
            "status": None,
            "error": str(exc),
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/light_status.html", context, status_code=400
        )

    try:
        status = await service.set_light_brightness(
            address,
            brightness=payload.brightness,
            color=payload.color,
        )
        context = {
            "request": request,
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": "Brightness updated.",
        }
    except HTTPException as exc:
        context = {
            "request": request,
            "status": None,
            "error": exc.detail,
            "message": None,
        }
        status_code = exc.status_code
    return templates.TemplateResponse(
        "partials/light_status.html", context, status_code=status_code
    )


@app.post("/ui/light/on", response_class=HTMLResponse)
async def ui_light_on(request: Request) -> HTMLResponse:
    form = await request.form()
    address = (
        form.get("address") or ""
    ).strip() or service.current_light_address()
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No light connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/light_status.html", context, status_code=400
        )

    status_code = 200
    try:
        status = await service.turn_light_on(address)
        context = {
            "request": request,
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": "Light turned on.",
        }
    except HTTPException as exc:
        context = {
            "request": request,
            "status": None,
            "error": exc.detail,
            "message": None,
        }
        status_code = exc.status_code
    return templates.TemplateResponse(
        "partials/light_status.html", context, status_code=status_code
    )


@app.post("/ui/light/off", response_class=HTMLResponse)
async def ui_light_off(request: Request) -> HTMLResponse:
    form = await request.form()
    address = (
        form.get("address") or ""
    ).strip() or service.current_light_address()
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No light connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/light_status.html", context, status_code=400
        )

    status_code = 200
    try:
        status = await service.turn_light_off(address)
        context = {
            "request": request,
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": "Light turned off.",
        }
    except HTTPException as exc:
        context = {
            "request": request,
            "status": None,
            "error": exc.detail,
            "message": None,
        }
        status_code = exc.status_code
    return templates.TemplateResponse(
        "partials/light_status.html", context, status_code=status_code
    )


@app.post("/ui/doser/request", response_class=HTMLResponse)
async def ui_doser_request(request: Request) -> HTMLResponse:
    address = service.current_doser_address()
    status_code = 200
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No dosing pump connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/doser_status.html", context, status_code=status_code
        )
    try:
        status = await service.request_status(address)
        context = {
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": "Status refreshed.",
        }
    except HTTPException as exc:
        context = {"status": None, "error": exc.detail, "message": None}
    context["request"] = request
    return templates.TemplateResponse(
        "partials/doser_status.html", context, status_code=status_code
    )


@app.post("/ui/light/request", response_class=HTMLResponse)
async def ui_light_request(request: Request) -> HTMLResponse:
    address = service.current_light_address()
    status_code = 200
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No light connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/light_status.html", context, status_code=status_code
        )
    try:
        status = await service.request_status(address)
        context = {
            "status": _cached_status_to_dict(status),
            "error": None,
            "message": "Status refreshed.",
        }
    except HTTPException as exc:
        context = {"status": None, "error": exc.detail, "message": None}
    context["request"] = request
    return templates.TemplateResponse(
        "partials/light_status.html", context, status_code=status_code
    )


@app.post("/api/devices/{address}/disconnect")
async def disconnect_device(address: str) -> Dict[str, str]:
    await service.disconnect_device(address)
    return {"detail": "disconnected"}


@app.post("/ui/doser/disconnect", response_class=HTMLResponse)
async def ui_doser_disconnect(request: Request) -> HTMLResponse:
    address = service.current_doser_address()
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No dosing pump connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/doser_status.html",
            context,
        )
    await service.disconnect_device(address)
    context = {
        "request": request,
        "status": None,
        "error": None,
        "message": "Disconnected.",
    }
    return templates.TemplateResponse(
        "partials/doser_status.html",
        context,
    )


@app.post("/ui/light/disconnect", response_class=HTMLResponse)
async def ui_light_disconnect(request: Request) -> HTMLResponse:
    address = service.current_light_address()
    if not address:
        context = {
            "request": request,
            "status": None,
            "error": "No light connected.",
            "message": None,
        }
        return templates.TemplateResponse(
            "partials/light_status.html",
            context,
        )
    await service.disconnect_device(address)
    context = {
        "request": request,
        "status": None,
        "error": None,
        "message": "Disconnected.",
    }
    return templates.TemplateResponse(
        "partials/light_status.html",
        context,
    )


@app.get("/ui/status", response_class=HTMLResponse)
async def ui_status(request: Request) -> HTMLResponse:
    snapshot = service.get_status_snapshot()
    return templates.TemplateResponse(
        "partials/status.html",
        {
            "request": request,
            "snapshot": snapshot,
            "format_ts": _format_timestamp,
        },
    )


@app.get("/debug", response_class=HTMLResponse)
async def debug_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        "debug.html",
        {"request": request, "format_ts": _format_timestamp},
    )


@app.get("/ui/debug/memory/raw", response_class=HTMLResponse)
async def debug_memory_raw(request: Request) -> HTMLResponse:
    snapshot = service.get_status_snapshot()
    raw_entries = [
        _cached_status_to_dict(status) for status in snapshot.values()
    ]
    context = {
        "request": request,
        "raw_entries": raw_entries,
        "error": None,
        "message": "Cached payloads",
        "format_ts": _format_timestamp,
    }
    return templates.TemplateResponse(
        "partials/debug_output.html",
        context,
    )


@app.post("/ui/debug/live/raw", response_class=HTMLResponse)
async def debug_live_raw(request: Request) -> HTMLResponse:
    raw_entries = []
    errors = []
    addresses = [
        addr
        for addr in [
            service.current_doser_address(),
            service.current_light_address(),
        ]
        if addr
    ]
    if not addresses:
        context = {
            "request": request,
            "raw_entries": [],
            "error": "No devices connected.",
            "message": None,
            "format_ts": _format_timestamp,
        }
        return templates.TemplateResponse(
            "partials/debug_output.html",
            context,
        )

    for addr in addresses:
        try:
            status = await service.request_status(addr)
            raw_entries.append(_cached_status_to_dict(status))
        except HTTPException as exc:
            errors.append(f"{addr}: {exc.detail}")

    context = {
        "request": request,
        "raw_entries": raw_entries,
        "error": ", ".join(errors) if errors else None,
        "message": "Live payloads refreshed" if raw_entries else None,
        "format_ts": _format_timestamp,
    }
    return templates.TemplateResponse(
        "partials/debug_output.html",
        context,
    )


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
