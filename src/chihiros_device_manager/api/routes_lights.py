"""Light-specific API routes."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Request

from ..schemas import (
    ConnectRequest,
    LightAutoSettingRequest,
    LightBrightnessRequest,
)
from ..serializers import cached_status_to_dict

router = APIRouter(prefix="/api/lights", tags=["lights"])


@router.post("/connect")
async def connect_light(
    request: Request, payload: ConnectRequest
) -> Dict[str, Any]:
    """Connect to a light and return its status."""
    service = request.app.state.service
    status = await service.connect_device(payload.address, "light")
    return cached_status_to_dict(service, status)


@router.post("/{address}/brightness")
async def set_light_brightness(
    request: Request, address: str, payload: LightBrightnessRequest
) -> Dict[str, Any]:
    """Set light brightness and return refreshed status.

    DEPRECATED: Use POST /api/devices/{address}/commands
    with action 'set_brightness' instead.
    This endpoint will be removed in a future version.
    """
    service = request.app.state.service
    status = await service.set_light_brightness(
        address,
        brightness=payload.brightness,
        color=payload.color,
    )
    return cached_status_to_dict(service, status)


@router.post("/{address}/on")
async def turn_light_on(request: Request, address: str) -> Dict[str, Any]:
    """Turn a light on and return current status.

    DEPRECATED: Use POST /api/devices/{address}/commands
    with action 'turn_on' instead.
    This endpoint will be removed in a future version.
    """
    service = request.app.state.service
    status = await service.turn_light_on(address)
    return cached_status_to_dict(service, status)


@router.post("/{address}/off")
async def turn_light_off(request: Request, address: str) -> Dict[str, Any]:
    """Turn a light off and return current status.

    DEPRECATED: Use POST /api/devices/{address}/commands
    with action 'turn_off' instead.
    This endpoint will be removed in a future version.
    """
    service = request.app.state.service
    status = await service.turn_light_off(address)
    return cached_status_to_dict(service, status)


@router.post("/{address}/auto/enable")
async def enable_auto_mode(request: Request, address: str) -> Dict[str, Any]:
    """Enable auto mode on the light and return refreshed status.

    DEPRECATED: Use POST /api/devices/{address}/commands
      with action 'enable_auto_mode' instead.
    This endpoint will be removed in a future version.
    """
    service = request.app.state.service
    status = await service.enable_auto_mode(address)
    return cached_status_to_dict(service, status)


@router.post("/{address}/auto/manual")
async def set_manual_mode(request: Request, address: str) -> Dict[str, Any]:
    """Switch the light to manual mode and return refreshed status.

    DEPRECATED: Use POST /api/devices/{address}/commands
      with action 'set_manual_mode' instead.
    This endpoint will be removed in a future version.
    """
    service = request.app.state.service
    status = await service.set_manual_mode(address)
    return cached_status_to_dict(service, status)


@router.post("/{address}/auto/reset")
async def reset_auto_settings(request: Request, address: str) -> Dict[str, Any]:
    """Reset all auto settings on the light and return refreshed status.

    DEPRECATED: Use POST /api/devices/{address}/commands
    with action 'reset_auto_settings' instead.
    This endpoint will be removed in a future version.
    """
    service = request.app.state.service
    status = await service.reset_auto_settings(address)
    return cached_status_to_dict(service, status)


@router.post("/{address}/auto/setting")
async def add_auto_setting(
    request: Request, address: str, payload: LightAutoSettingRequest
) -> Dict[str, Any]:
    """Add an auto-mode schedule entry to a light and return refreshed status.

    DEPRECATED: Use POST /api/devices/{address}/commands
    with action 'add_auto_setting' instead.
    This endpoint will be removed in a future version.
    """
    service = request.app.state.service
    status = await service.add_light_auto_setting(
        address,
        sunrise=payload.sunrise,
        sunset=payload.sunset,
        brightness=payload.brightness,
        ramp_up_minutes=payload.ramp_up_minutes,
        weekdays=[x for x in (payload.weekdays or [])],
    )
    return cached_status_to_dict(service, status)
