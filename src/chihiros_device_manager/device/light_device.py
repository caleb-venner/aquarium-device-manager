"""Base class for Chihiros lighting devices with status support."""

from __future__ import annotations

from typing import Optional

from bleak.backends.service import BleakGATTCharacteristic

from .. import commands
from ..light_status import ParsedLightStatus, parse_light_status
from .base_device import BaseDevice


class LightDevice(BaseDevice):
    """Base class for Chihiros lights that can request status updates."""

    _last_status: Optional[ParsedLightStatus] = None

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
                try:
                    parsed = parse_light_status(payload)
                except Exception:
                    # Keep raw_payload available in the parsed-like structure
                    # as a fallback so other parts of the code can still
                    # access `raw_payload` even when parsing fails.
                    parsed = ParsedLightStatus(
                        message_id=None,
                        response_mode=None,
                        weekday=None,
                        current_hour=None,
                        current_minute=None,
                        keyframes=[],
                        time_markers=[],
                        tail=b"",
                        raw_payload=payload,
                    )
                self._last_status = parsed
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
    def last_status(self) -> Optional[ParsedLightStatus]:
        """Return the most recent status payload captured from the light."""
        return self._last_status
