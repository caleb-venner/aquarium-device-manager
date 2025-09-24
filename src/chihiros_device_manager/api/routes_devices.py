from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from ..device import Doser, LightDevice, get_device_from_address
from ..serializers import cached_status_to_dict


router = APIRouter(prefix="/api", tags=["devices"])


@router.get("/status")
async def get_status(request: Request) -> Dict[str, Any]:
    service = request.app.state.service
    snapshot = service.get_status_snapshot()
    results = {}
    for address, cached in snapshot.items():
        results[address] = cached_status_to_dict(service, cached)
    return results


@router.post("/debug/live-status")
async def debug_live_status(request: Request) -> Dict[str, Any]:
    service = request.app.state.service
    statuses, errors = await service.get_live_statuses()
    return {
        "statuses": [cached_status_to_dict(service, status) for status in statuses],
        "errors": errors,
    }


@router.get("/scan")
async def scan_devices(request: Request, timeout: float = 5.0) -> list[Dict[str, Any]]:
    service = request.app.state.service
    return await service.scan_devices(timeout=timeout)


@router.post("/devices/{address}/status")
async def refresh_status(request: Request, address: str) -> Dict[str, Any]:
    service = request.app.state.service
    status = await service.request_status(address)
    return cached_status_to_dict(service, status)


@router.post("/devices/{address}/connect")
async def reconnect_device(request: Request, address: str) -> Dict[str, Any]:
    service = request.app.state.service
    cached = service.get_status_snapshot().get(address)
    if cached:
        if cached.device_type == "doser":
            status = await service.connect_doser(address)
            return cached_status_to_dict(service, status)
        if cached.device_type == "light":
            status = await service.connect_light(address)
            return cached_status_to_dict(service, status)

    try:
        device = await get_device_from_address(address)
    except Exception as exc:  # pragma: no cover - passthrough
        raise HTTPException(status_code=404, detail="Device not found") from exc

    if isinstance(device, Doser):
        status = await service.connect_doser(address)
        return cached_status_to_dict(service, status)
    if isinstance(device, LightDevice):
        status = await service.connect_light(address)
        return cached_status_to_dict(service, status)

    raise HTTPException(status_code=400, detail="Unsupported device type")


@router.post("/devices/{address}/disconnect")
async def disconnect_device(request: Request, address: str) -> Dict[str, str]:
    service = request.app.state.service
    await service.disconnect_device(address)
    return {"detail": "disconnected"}
