"""Command execution service for device commands."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException
from pydantic import ValidationError

from .ble_service import BLEService
from .commands_model import COMMAND_ARG_SCHEMAS, CommandRecord, CommandRequest
from .serializers import cached_status_to_dict

logger = logging.getLogger(__name__)


class CommandExecutor:
    """Executes commands on devices through BLE service."""

    def __init__(self, ble_service: BLEService):
        """Execute commands on devices through BLE service."""
        self.ble_service = ble_service
        self._device_locks: Dict[str, asyncio.Lock] = {}

    def _get_device_lock(self, address: str) -> asyncio.Lock:
        """Get or create a lock for device operations."""
        if address not in self._device_locks:
            self._device_locks[address] = asyncio.Lock()
        return self._device_locks[address]

    def validate_command_args(
        self, action: str, args: Optional[Dict[str, Any]]
    ) -> None:
        """Validate command arguments against schema."""
        schema_class = COMMAND_ARG_SCHEMAS.get(action)
        if schema_class is None:
            # Action requires no arguments
            if args is not None and args:
                raise ValueError(f"Action '{action}' does not accept arguments")
            return

        if args is None:
            raise ValueError(f"Action '{action}' requires arguments")

        try:
            schema_class(**args)
        except ValidationError as exc:
            raise ValueError(
                f"Invalid arguments for '{action}': {exc}"
            ) from exc

    async def execute_command(
        self, address: str, request: CommandRequest
    ) -> CommandRecord:
        """Execute a command synchronously and return the record."""
        # Validate command arguments
        try:
            self.validate_command_args(request.action, request.args)
        except ValueError as exc:
            record = CommandRecord(
                id=request.id or "",
                address=address,
                action=request.action,
                args=request.args,
                timeout=request.timeout or 10.0,
            )
            record.mark_failed(str(exc))
            return record

        # Create command record
        record = CommandRecord(
            id=request.id or "",
            address=address,
            action=request.action,
            args=request.args,
            timeout=request.timeout or 10.0,
        )

        # Acquire device lock to prevent concurrent operations
        lock = self._get_device_lock(address)

        try:
            async with lock:
                record.mark_started()

                # Execute with timeout
                try:
                    result = await asyncio.wait_for(
                        self._execute_action(
                            address, request.action, request.args or {}
                        ),
                        timeout=record.timeout,
                    )
                    record.mark_success(result)

                except asyncio.TimeoutError:
                    record.mark_timeout()
                    logger.warning(
                        "Command %s timed out for device %s after %s seconds",
                        request.action,
                        address,
                        record.timeout,
                    )

                except HTTPException as exc:
                    error_msg = getattr(exc, "detail", str(exc))
                    record.mark_failed(f"HTTP {exc.status_code}: {error_msg}")
                    logger.error(
                        "Command %s failed for device %s: %s",
                        request.action,
                        address,
                        error_msg,
                    )

                except Exception as exc:
                    record.mark_failed(str(exc))
                    logger.error(
                        "Command %s failed for device %s: %s",
                        request.action,
                        address,
                        exc,
                        exc_info=True,
                    )

        except Exception as exc:
            # Lock acquisition failed or unexpected error
            record.mark_failed(f"Lock acquisition failed: {exc}")
            logger.error(
                "Failed to acquire lock for device %s: %s", address, exc
            )

        return record

    async def _execute_action(
        self, address: str, action: str, args: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Execute the specific action on the device."""
        # Map actions to BLE service methods
        if action == "turn_on":
            status = await self.ble_service.turn_light_on(address)
            return cached_status_to_dict(self.ble_service, status)

        elif action == "turn_off":
            status = await self.ble_service.turn_light_off(address)
            return cached_status_to_dict(self.ble_service, status)

        elif action == "set_brightness":
            status = await self.ble_service.set_light_brightness(
                address,
                brightness=args["brightness"],
                color=args.get("color", 0),
            )
            return cached_status_to_dict(self.ble_service, status)

        elif action == "enable_auto_mode":
            status = await self.ble_service.enable_auto_mode(address)
            return cached_status_to_dict(self.ble_service, status)

        elif action == "set_manual_mode":
            status = await self.ble_service.set_manual_mode(address)
            return cached_status_to_dict(self.ble_service, status)

        elif action == "reset_auto_settings":
            status = await self.ble_service.reset_auto_settings(address)
            return cached_status_to_dict(self.ble_service, status)

        elif action == "add_auto_setting":
            status = await self.ble_service.add_light_auto_setting(
                address,
                sunrise=args["sunrise"],
                sunset=args["sunset"],
                brightness=args["brightness"],
                ramp_up_minutes=args.get("ramp_up_minutes", 0),
                weekdays=args.get("weekdays", []),
            )
            return cached_status_to_dict(self.ble_service, status)

        elif action == "set_schedule":
            status = await self.ble_service.set_doser_schedule(
                address,
                head_index=args["head_index"],
                volume_tenths_ml=args["volume_tenths_ml"],
                hour=args["hour"],
                minute=args["minute"],
                weekdays=args.get("weekdays"),
                confirm=args.get("confirm", True),
                wait_seconds=args.get("wait_seconds", 2.0),
            )
            return cached_status_to_dict(self.ble_service, status)

        else:
            raise ValueError(f"Unsupported action: {action}")
