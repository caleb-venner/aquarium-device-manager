"""Unified command system API routes."""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from ..command_executor import CommandExecutor
from ..commands_model import CommandRecord, CommandRequest

router = APIRouter(prefix="/api", tags=["commands"])


@router.post("/devices/{address}/commands")
async def execute_command(
    request: Request, address: str, command_request: CommandRequest
) -> Dict[str, Any]:
    """Execute a command on a device and return the result."""
    service = request.app.state.service

    # Check if device exists in cache (basic validation)
    snapshot = service.get_status_snapshot()
    if address not in snapshot:
        raise HTTPException(status_code=404, detail="Device not found")

    # Check for device busy (concurrent command prevention)
    if hasattr(request.app.state, "command_executor"):
        executor = request.app.state.command_executor
    else:
        executor = CommandExecutor(service)
        request.app.state.command_executor = executor

    # Check if command with same ID already exists (idempotency)
    if command_request.id:
        existing = service.get_command(address, command_request.id)
        if existing:
            return existing

    # Execute command
    try:
        record = await executor.execute_command(address, command_request)

        # Persist command record
        service.save_command(record)

        # Save state to disk
        await service._save_state()

        return record.to_dict()

    except Exception as exc:
        # Create failed record for unexpected errors
        record = CommandRecord(
            id=command_request.id or "",
            address=address,
            action=command_request.action,
            args=command_request.args,
            timeout=command_request.timeout or 10.0,
        )
        record.mark_failed(f"Unexpected error: {exc}")
        service.save_command(record)
        await service._save_state()
        return record.to_dict()


@router.get("/devices/{address}/commands")
async def list_commands(
    request: Request, address: str, limit: int = 20
) -> List[Dict[str, Any]]:
    """List recent commands for a device."""
    service = request.app.state.service

    # Check if device exists
    snapshot = service.get_status_snapshot()
    if address not in snapshot:
        raise HTTPException(status_code=404, detail="Device not found")

    commands = service.get_commands(address, limit)
    return commands


@router.get("/devices/{address}/commands/{command_id}")
async def get_command(
    request: Request, address: str, command_id: str
) -> Dict[str, Any]:
    """Get a specific command by ID."""
    service = request.app.state.service

    # Check if device exists
    snapshot = service.get_status_snapshot()
    if address not in snapshot:
        raise HTTPException(status_code=404, detail="Device not found")

    command = service.get_command(address, command_id)
    if not command:
        raise HTTPException(status_code=404, detail="Command not found")

    return command
