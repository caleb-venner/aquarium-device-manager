"""Doser-specific API routes."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Request

from ..schemas import ConnectRequest, DoserScheduleRequest
from ..serializers import cached_status_to_dict

router = APIRouter(prefix="/api/dosers", tags=["dosers"])


@router.post("/connect")
async def connect_doser(
    request: Request, payload: ConnectRequest
) -> Dict[str, Any]:
    """Connect to a doser and return its status."""
    service = request.app.state.service
    status = await service.connect_device(payload.address, "doser")
    return cached_status_to_dict(service, status)


@router.post("/{address}/schedule")
async def set_doser_schedule(
    request: Request, address: str, payload: DoserScheduleRequest
) -> Dict[str, Any]:
    """Apply schedule update to a doser and return refreshed status."""
    service = request.app.state.service
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
