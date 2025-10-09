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
        """Update daily schedule and optionally refresh status.

        Uses the complete 8-command sequence from ground truth analysis:

        Phase 1 - Prelude (setup and synchronization):
        1. Handshake command (0x5A, mode 0x04) - initial status request
        2. First time sync command (0x5A, mode 0x09) - initial clock sync
        3. Second time sync command (0x5A, mode 0x09) - confirmation sync
        4. Prepare command stage 0x04 (0xA5, mode 0x04) - prepare device
        5. Prepare command stage 0x05 (0xA5, mode 0x04) - confirm prepare
        6. Head select command (0xA5, mode 0x20) - select dosing head

        Phase 2 - Programming (dose configuration):
        7. Head dose command (0xA5, mode 0x1B) - set volume and weekdays
        8. Head schedule command (0xA5, mode 0x15) - set daily time

        This matches both the iPhone app logs and other working implementations.
        """
        weekday_mask = doser_commands.encode_weekdays(weekdays)

        # Phase 1: Prelude - Setup and synchronization (6 commands)
        prelude_commands = [
            # 1. Handshake - initial device communication
            doser_commands.create_handshake_command(self.get_next_msg_id()),
            # 2. First time sync - initial device clock synchronization
            doser_commands.create_set_time_command(self.get_next_msg_id()),
            # 3. Second time sync - confirmation sync (iPhone app pattern)
            doser_commands.create_set_time_command(self.get_next_msg_id()),
            # 4. Prepare stage 0x04 - prepare device for configuration
            doser_commands.create_prepare_command(self.get_next_msg_id(), 0x04),
            # 5. Prepare stage 0x05 - confirm device is ready
            doser_commands.create_prepare_command(self.get_next_msg_id(), 0x05),
            # 6. Head select - choose which dosing head to configure
            doser_commands.create_head_select_command(
                self.get_next_msg_id(), head_index
            ),
        ]

        # Send prelude commands sequentially
        for cmd in prelude_commands:
            await self._send_command(bytes(cmd), 3)

        # Phase 2: Programming - Dose configuration (2 commands)
        programming_commands = [
            # 7. Head dose - set volume and weekday schedule
            doser_commands.create_head_dose_command(
                self.get_next_msg_id(),
                head_index,
                volume_tenths_ml,
                weekday_mask=weekday_mask,
            ),
            # 8. Head schedule - set daily dosing time
            doser_commands.create_head_schedule_command(
                self.get_next_msg_id(), head_index, hour, minute
            ),
        ]

        # Send programming commands sequentially
        for cmd in programming_commands:
            await self._send_command(bytes(cmd), 3)

        if not confirm:
            return None

        await self.request_status()
        await asyncio.sleep(max(0.0, wait_seconds))
        return self._last_status
