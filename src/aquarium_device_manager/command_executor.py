"""Command execution service for device commands."""

from __future__ import annotations

import asyncio
import logging
from datetime import time
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
                address=address,
                action=request.action,
                args=request.args,
                timeout=request.timeout or 10.0,
            )
            if request.id is not None:
                record.id = request.id
            record.mark_failed(str(exc))
            return record

        # Create command record
        record = CommandRecord(
            address=address,
            action=request.action,
            args=request.args,
            timeout=request.timeout or 10.0,
        )
        if request.id is not None:
            record.id = request.id

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

            # Update and persist light configuration
            await self._save_light_brightness_config(address, args)

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
            # Convert string times to datetime.time objects
            sunrise_str = args["sunrise"]
            sunset_str = args["sunset"]

            def parse_time(time_str: str) -> time:
                """Convert HH:MM string to datetime.time object."""
                hours, minutes = time_str.split(":")
                return time(int(hours), int(minutes))

            status = await self.ble_service.add_light_auto_setting(
                address,
                sunrise=parse_time(sunrise_str),
                sunset=parse_time(sunset_str),
                brightness=args["brightness"],
                ramp_up_minutes=args.get("ramp_up_minutes", 0),
                weekdays=args.get("weekdays"),
            )

            # Update and persist light configuration
            await self._save_light_auto_setting_config(address, args)

            return cached_status_to_dict(self.ble_service, status)

        elif action == "set_schedule":
            status = await self.ble_service.set_doser_schedule(
                address,
                head_index=args["head_index"],
                volume_tenths_ml=args["volume_tenths_ml"],
                hour=args["hour"],
                minute=args["minute"],
                weekdays=args.get("weekdays"),  # Now passes List[PumpWeekday]
                confirm=args.get("confirm", True),
                wait_seconds=args.get("wait_seconds", 2.0),
            )

            # Update and persist doser configuration
            await self._save_doser_schedule_config(address, args)

            return cached_status_to_dict(self.ble_service, status)

        else:
            raise ValueError(f"Unsupported action: {action}")

    async def _save_doser_schedule_config(
        self, address: str, args: Dict[str, Any]
    ) -> None:
        """Save doser schedule configuration after successful command.

        Args:
            address: Device MAC address
            args: Command arguments from set_schedule
        """
        if not self.ble_service._auto_save_config:
            logger.debug("Auto-save config disabled, skipping")
            return

        try:
            from .config_helpers import update_doser_schedule_config

            device = self.ble_service._doser_storage.get_device(address)
            if device:
                # Update the existing configuration
                device = update_doser_schedule_config(device, args)
                self.ble_service._doser_storage.upsert_device(device)
                logger.info(
                    f"Saved doser configuration for {address}, "
                    f"head {args['head_index']}"
                )
            else:
                # Create new configuration from the actual command being sent
                from .config_helpers import create_doser_config_from_command

                logger.info(
                    f"Creating new configuration for doser {address} "
                    f"from schedule command"
                )
                device = create_doser_config_from_command(address, args)
                self.ble_service._doser_storage.upsert_device(device)
                logger.info(
                    f"Created and saved new doser configuration for {address}, "
                    f"head {args['head_index']}"
                )
        except Exception as exc:
            # Don't fail the command if config save fails
            logger.error(
                f"Failed to save doser configuration for {address}: {exc}",
                exc_info=True,
            )

    async def _save_light_brightness_config(
        self, address: str, args: Dict[str, Any]
    ) -> None:
        """Save light brightness configuration after successful command.

        Args:
            address: Device MAC address
            args: Command arguments from set_brightness
        """
        if not self.ble_service._auto_save_config:
            logger.debug("Auto-save config disabled, skipping")
            return

        try:
            from .config_helpers import update_light_brightness

            device = self.ble_service._light_storage.get_device(address)
            if device:
                # Update the existing configuration
                device = update_light_brightness(
                    device,
                    brightness=args["brightness"],
                    color=args.get("color", 0),
                )
                self.ble_service._light_storage.upsert_device(device)
                logger.info(
                    f"Saved light configuration for {address}, "
                    f"brightness={args['brightness']}"
                )
            else:
                # Create new configuration from the actual command being sent
                from .config_helpers import create_light_config_from_command

                logger.info(
                    f"Creating new profile for light {address} "
                    f"from brightness command"
                )
                device = create_light_config_from_command(
                    address, "brightness", args
                )
                self.ble_service._light_storage.upsert_device(device)
                logger.info(
                    f"Created and saved new light profile for {address}, "
                    f"brightness={args['brightness']}"
                )
        except Exception as exc:
            # Don't fail the command if config save fails
            logger.error(
                f"Failed to save light configuration for {address}: {exc}",
                exc_info=True,
            )

    async def _save_light_auto_setting_config(
        self, address: str, args: Dict[str, Any]
    ) -> None:
        """Save light auto setting configuration after successful command.

        Args:
            address: Device MAC address
            args: Command arguments from add_auto_setting
        """
        if not self.ble_service._auto_save_config:
            logger.debug("Auto-save config disabled, skipping")
            return

        try:
            from .config_helpers import add_light_auto_program

            device = self.ble_service._light_storage.get_device(address)
            if device:
                # Convert weekdays to strings
                weekdays = args.get("weekdays")
                if weekdays:
                    weekdays = [day.value for day in weekdays]

                # Update the existing configuration
                device = add_light_auto_program(
                    device,
                    sunrise=args["sunrise"],
                    sunset=args["sunset"],
                    brightness=args["brightness"],
                    ramp_up_minutes=args.get("ramp_up_minutes", 0),
                    weekdays=weekdays,
                )
                self.ble_service._light_storage.upsert_device(device)
                logger.info(
                    f"Saved light auto program for {address}, "
                    f"{args['sunrise']}-{args['sunset']}"
                )
            else:
                # Create new configuration from the actual command being sent
                from .config_helpers import create_light_config_from_command

                logger.info(
                    f"Creating new profile for light {address} "
                    f"from auto program command"
                )
                device = create_light_config_from_command(
                    address, "auto_program", args
                )
                self.ble_service._light_storage.upsert_device(device)
                logger.info(
                    f"Created and saved new light profile for {address}, "
                    f"{args['sunrise']}-{args['sunset']}"
                )
        except Exception as exc:
            # Don't fail the command if config save fails
            logger.error(
                f"Failed to save light auto program for {address}: {exc}",
                exc_info=True,
            )
