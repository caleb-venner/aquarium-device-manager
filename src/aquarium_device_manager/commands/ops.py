"""Device command helpers split out from ble_service for readability.

These are thin adapters that accept a running BLEService-like object
and perform device-level commands, delegating to the service's
connection and status helpers.
"""

from __future__ import annotations

from datetime import time as _time
from typing import TYPE_CHECKING, Any, Sequence

from fastapi import HTTPException

try:
    from bleak_retry_connector import BleakConnectionError, BleakNotFoundError
except ImportError:  # pragma: no cover - fallback if library changes

    class BleakNotFoundError(Exception):
        """Raised when a BLE device cannot be found during connection attempts."""

        pass

    class BleakConnectionError(Exception):
        """Raised when a BLE connection attempt fails irrecoverably."""

        pass


from ..commands import encoder as doser_commands
from .encoder import LightWeekday

if TYPE_CHECKING:
    # Avoid runtime import cycles; used for type annotations only
    from ..ble_service import CachedStatus


async def set_doser_schedule(
    service: Any,
    address: str,
    *,
    head_index: int,
    volume_tenths_ml: int,
    hour: int,
    minute: int,
    weekdays: Sequence[doser_commands.PumpWeekday] | None = None,
    confirm: bool = False,
    wait_seconds: float = 1.5,
) -> "CachedStatus":
    """Set a daily dose schedule on a connected doser device."""
    device = await service._ensure_device(address, "doser")
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
    return await service._refresh_device_status("doser", persist=True)


async def set_light_brightness(
    service: Any, address: str, *, brightness: int, color: str | int = 0
) -> "CachedStatus":
    """Set the light brightness and optional color on a device."""
    device = await service._ensure_device(address, "light")
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
    return await service._refresh_device_status("light", persist=True)


async def turn_light_on(service: Any, address: str) -> "CachedStatus":
    """Turn the specified light device on."""
    device = await service._ensure_device(address, "light")
    try:
        await device.turn_on()
    except (BleakNotFoundError, BleakConnectionError) as exc:
        raise HTTPException(
            status_code=404, detail="Light not reachable"
        ) from exc
    return await service._refresh_device_status("light", persist=True)


async def turn_light_off(service: Any, address: str) -> "CachedStatus":
    """Turn the specified light device off."""
    device = await service._ensure_device(address, "light")
    try:
        await device.turn_off()
    except (BleakNotFoundError, BleakConnectionError) as exc:
        raise HTTPException(
            status_code=404, detail="Light not reachable"
        ) from exc
    return await service._refresh_device_status("light", persist=True)


async def enable_auto_mode(service: Any, address: str) -> "CachedStatus":
    """Enable auto mode on the light device."""
    device = await service._ensure_device(address, "light")
    try:
        await device.enable_auto_mode()
    except (BleakNotFoundError, BleakConnectionError) as exc:
        raise HTTPException(
            status_code=404, detail="Light not reachable"
        ) from exc
    return await service._refresh_device_status("light", persist=True)


async def set_manual_mode(service: Any, address: str) -> "CachedStatus":
    """Switch the light device to manual control mode."""
    device = await service._ensure_device(address, "light")
    try:
        await device.set_manual_mode()
    except (BleakNotFoundError, BleakConnectionError) as exc:
        raise HTTPException(
            status_code=404, detail="Light not reachable"
        ) from exc
    return await service._refresh_device_status("light", persist=True)


async def reset_auto_settings(service: Any, address: str) -> "CachedStatus":
    """Reset stored auto settings on the light device."""
    device = await service._ensure_device(address, "light")
    try:
        await device.reset_settings()
    except (BleakNotFoundError, BleakConnectionError) as exc:
        raise HTTPException(
            status_code=404, detail="Light not reachable"
        ) from exc
    return await service._refresh_device_status("light", persist=True)


async def add_light_auto_setting(
    service: Any,
    address: str,
    *,
    sunrise: _time,
    sunset: _time,
    brightness: object,
    ramp_up_minutes: int = 0,
    weekdays: list[LightWeekday] | None = None,
) -> "CachedStatus":
    """Add an auto program setting to the specified light device."""
    device = await service._ensure_device(address, "light")
    try:
        if isinstance(brightness, int):
            await device.add_setting(
                sunrise,
                sunset,
                int(brightness),
                ramp_up_minutes,
                weekdays or [LightWeekday.everyday],
            )
        elif isinstance(brightness, (list, tuple)):
            if len(brightness) != 3:
                raise ValueError("RGB brightness must be three values")
            rgb = tuple(int(x) for x in brightness)
            await device.add_rgb_setting(
                sunrise,
                sunset,
                rgb,
                ramp_up_minutes,
                weekdays or [LightWeekday.everyday],
            )
        else:
            raise ValueError(
                "brightness must be an int or three-element sequence"
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (BleakNotFoundError, BleakConnectionError) as exc:
        raise HTTPException(
            status_code=404, detail="Light not reachable"
        ) from exc

    return await service._refresh_device_status("light", persist=True)
