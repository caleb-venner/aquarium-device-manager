"""Chihiros dosing pump device model."""

from __future__ import annotations

import asyncio
from typing import ClassVar, Sequence

from bleak.backends.characteristic import BleakGATTCharacteristic

from ..commands import encoder as doser_commands
from ..doser_status import DoserStatus, parse_doser_payload
from .base_device import BaseDevice


class Doser(BaseDevice):
    """Chihiros four-head dosing pump."""

    device_kind: ClassVar[str] = "doser"
    status_serializer: ClassVar[str | None] = "serialize_doser_status"
    _model_name = "Dosing Pump"
    _model_codes = ["DYDOSE"]
    _colors: dict[str, int] = {}

    _last_status: DoserStatus | None = None

    async def request_status(self) -> None:
        """Send a handshake to ask the pump for its latest status."""
        cmd = doser_commands.create_handshake_command(self.get_next_msg_id())
        await self._send_command(cmd, 3)

    def _notification_handler(
        self, _sender: BleakGATTCharacteristic, data: bytearray
    ) -> None:
        """Capture raw notification bytes from the pump."""
        self.handle_notification(bytes(data))

    def handle_notification(self, payload: bytes) -> None:
        """Handle an incoming UART notification from the pump."""
        # Parse the incoming payload into a DoserStatus and keep only the
        # canonical parsed status. Historically we retained a short history
        # of fragments for the service to merge; after refactor the device
        # provides the canonical parsed view and the service consumes that
        # directly (similar to lights).
        try:
            parsed = parse_doser_payload(payload)
        except Exception:
            # If parsing fails, keep no change to last_status rather than
            # overwrite with invalid data.
            return
        self._last_status = parsed

    @property
    def last_status(self) -> DoserStatus | None:
        """Return the most recent DoserStatus decoded from the pump."""
        return self._last_status

    async def set_daily_dose(
        self,
        head_index: int,
        volume_tenths_ml: int,
        hour: int,
        minute: int,
        *,
        weekdays: (
            doser_commands.PumpWeekday
            | Sequence[doser_commands.PumpWeekday]
            | None
        ) = None,
        confirm: bool = False,
        wait_seconds: float = 1.5,
    ) -> DoserStatus | None:
        """Update daily schedule and optionally refresh status."""
        weekday_mask = doser_commands.encode_pump_weekdays(weekdays)
        command_batch = [
            doser_commands.create_prepare_command(
                self.get_next_msg_id(),
                0x04,
            ),
            doser_commands.create_prepare_command(
                self.get_next_msg_id(),
                0x05,
            ),
            doser_commands.create_head_select_command(
                self.get_next_msg_id(), head_index
            ),
            doser_commands.create_head_dose_command(
                self.get_next_msg_id(),
                head_index,
                volume_tenths_ml,
                weekday_mask=weekday_mask,
            ),
            doser_commands.create_head_schedule_command(
                self.get_next_msg_id(), head_index, hour, minute
            ),
        ]
        # Convert bytearray commands to bytes for _send_command
        command_bytes = [bytes(cmd) for cmd in command_batch]
        await self._send_command(command_bytes, 3)

        if not confirm:
            return None

        await self.request_status()
        await asyncio.sleep(max(0.0, wait_seconds))
        return self._last_status
