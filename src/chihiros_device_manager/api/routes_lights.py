"""Light-specific API routes."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Request

from ..schemas import ConnectRequest, LightBrightnessRequest
from ..serializers import cached_status_to_dict

router = APIRouter(prefix="/api/lights", tags=["lights"])


@router.post("/connect")
async def connect_light(
    request: Request, payload: ConnectRequest
) -> Dict[str, Any]:
    """Connect to a light and return its status."""
    service = request.app.state.service
    status = await service.connect_light(payload.address)
    return cached_status_to_dict(service, status)


@router.post("/{address}/brightness")
async def set_light_brightness(
    request: Request, address: str, payload: LightBrightnessRequest
) -> Dict[str, Any]:
    """Set light brightness and return refreshed status."""
    service = request.app.state.service
    status = await service.set_light_brightness(
        address,
        brightness=payload.brightness,
        color=payload.color,
    )
    return cached_status_to_dict(service, status)


@router.post("/{address}/on")
async def turn_light_on(request: Request, address: str) -> Dict[str, Any]:
    """Turn a light on and return current status."""
    service = request.app.state.service
    status = await service.turn_light_on(address)
    return cached_status_to_dict(service, status)


@router.post("/{address}/off")
async def turn_light_off(request: Request, address: str) -> Dict[str, Any]:
    """Turn a light off and return current status."""
    service = request.app.state.service
    status = await service.turn_light_off(address)
    return cached_status_to_dict(service, status)
