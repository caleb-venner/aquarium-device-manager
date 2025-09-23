"""Base class for Chihiros lighting devices with status support."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from bleak.backends.service import BleakGATTCharacteristic

from .. import commands
from .base_device import BaseDevice


@dataclass(slots=True)
class LightStatus:
    """Container for the latest status payload emitted by a light."""

    raw_payload: bytes


class LightDevice(BaseDevice):
    """Base class for Chihiros lights that can request status updates."""

    _last_status: Optional[LightStatus] = None

    async def request_status(self) -> None:
        """Trigger a status report from the light via the UART handshake."""

        cmd = commands.create_status_request_command(self.get_next_msg_id())
        await self._send_command(cmd, 3)

    def _notification_handler(
        self, _sender: BleakGATTCharacteristic, data: bytearray
    ) -> None:
        """Handle notifications from the light, capturing status payloads."""

        payload = bytes(data)
        if not payload:
            return

        if payload[0] == 0x5B and len(payload) >= 6:
            mode = payload[5]
            if mode == 0xFE:
                self._last_status = LightStatus(raw_payload=payload)
                self._logger.debug(
                    "%s: Status payload: %s", self.name, payload.hex()
                )
                return
            if mode == 0x0A:
                self._logger.debug(
                    "%s: Handshake ack: %s", self.name, payload.hex()
                )
                return

        self._logger.debug(
            "%s: Notification received: %s", self.name, payload.hex()
        )

    @property
    def last_status(self) -> Optional[LightStatus]:
        """Return the most recent status payload captured from the light."""

        return self._last_status
