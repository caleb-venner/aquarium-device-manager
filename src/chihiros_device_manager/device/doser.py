"""Chihiros dosing pump device model."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Sequence

from bleak.backends.service import BleakGATTCharacteristic

from .. import doser_commands
from .base_device import BaseDevice


@dataclass(slots=True)
class DoserStatus:
    """Simple container for the current state reported by the pump."""

    raw_payload: bytes


class Doser(BaseDevice):
    """Chihiros four-head dosing pump."""

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
        self._last_status = DoserStatus(raw_payload=payload)

    @property
    def last_status(self) -> DoserStatus | None:
        """Return the most recent status decoded from the pump."""
        return self._last_status

    async def set_daily_dose(
        self,
        head_index: int,
        volume_tenths_ml: int,
        hour: int,
        minute: int,
        *,
        weekdays: doser_commands.Weekday
        | Sequence[doser_commands.Weekday]
        | None = None,
        confirm: bool = False,
        wait_seconds: float = 1.5,
    ) -> DoserStatus | None:
        """Update daily schedule for a head and optionally confirm via status."""

        weekday_mask = doser_commands.encode_weekdays(weekdays)
        command_batch = [
            doser_commands.create_prepare_command(self.get_next_msg_id(), 0x04),
            doser_commands.create_prepare_command(self.get_next_msg_id(), 0x05),
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
        await self._send_command(command_batch, 3)

        if not confirm:
            return None

        await self.request_status()
        await asyncio.sleep(max(0.0, wait_seconds))
        return self._last_status
