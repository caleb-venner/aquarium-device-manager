"""Base class for Chihiros lighting devices with status support."""

from __future__ import annotations

from typing import ClassVar, Optional

from bleak.backends.characteristic import BleakGATTCharacteristic

from ..commands import encoder as commands
from ..light_status import ParsedLightStatus, parse_light_payload
from .base_device import BaseDevice


class LightDevice(BaseDevice):
    """Base class for Chihiros lights that can request status updates."""

    device_kind: ClassVar[str] = "light"
    status_serializer: ClassVar[str | None] = "serialize_light_status"
    _last_status: Optional[ParsedLightStatus] = None

    async def request_status(self) -> None:
        """Trigger a status report from the light via the UART handshake."""
        cmd = commands.create_status_request_command(self.get_next_msg_id())
        await self._send_command(cmd, 3)

    def _notification_handler(
        self, _sender: BleakGATTCharacteristic, data: bytearray
    ) -> None:
        """BLE notification callback: delegates to handle_notification."""
        self.handle_notification(bytes(data))

    def handle_notification(self, payload: bytes) -> None:
        """Handle an incoming UART notification from the light."""
        if not payload:
            return

        if payload[0] == 0x5B and len(payload) >= 6:
            mode = payload[5]
            if mode == 0xFE:
                try:
                    parsed = parse_light_payload(payload)
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

    async def set_color_brightness(
        self,
        brightness: int,
        color: str | int = 0,
    ) -> None:
        """Set brightness of a color."""
        color_id: int | None = None
        if isinstance(color, int) and color in self._colors.values():
            color_id = color
        elif isinstance(color, str) and color in self._colors:
            color_id = self._colors.get(color)
        if color_id is None:
            self._logger.warning("Color not supported: `%s`", color)
            return
        cmd = commands.create_manual_setting_command(
            self.get_next_msg_id(), color_id, brightness
        )
        await self._send_command(cmd, 3)

    async def set_brightness(self, brightness: int) -> None:
        """Set light brightness."""
        await self.set_color_brightness(brightness)

    async def set_rgb_brightness(
        self, brightness: tuple[int, int, int]
    ) -> None:
        """Set RGB brightness."""
        for c, b in enumerate(brightness):
            await self.set_color_brightness(c, b)

    async def turn_on(self) -> None:
        """Turn on light."""
        for color_name in self._colors:
            await self.set_color_brightness(100, color_name)

    async def turn_off(self) -> None:
        """Turn off light."""
        for color_name in self._colors:
            await self.set_color_brightness(0, color_name)

    async def add_setting(
        self,
        sunrise,
        sunset,
        max_brightness: int = 100,
        ramp_up_in_minutes: int = 0,
        weekdays: list[commands.LightWeekday] | None = None,
    ) -> None:
        """Add an automation setting to the light."""
        cmd = commands.create_add_auto_setting_command(
            self.get_next_msg_id(),
            sunrise.time(),
            sunset.time(),
            (max_brightness, 255, 255),
            ramp_up_in_minutes,
            commands.encode_light_weekdays(
                weekdays or [commands.LightWeekday.everyday]
            ),
        )
        await self._send_command(cmd, 3)

    async def add_rgb_setting(
        self,
        sunrise,
        sunset,
        max_brightness: tuple[int, int, int] = (100, 100, 100),
        ramp_up_in_minutes: int = 0,
        weekdays: list[commands.LightWeekday] | None = None,
    ) -> None:
        """Add an automation setting to the RGB light."""
        cmd = commands.create_add_auto_setting_command(
            self.get_next_msg_id(),
            sunrise.time(),
            sunset.time(),
            max_brightness,
            ramp_up_in_minutes,
            commands.encode_light_weekdays(
                weekdays or [commands.LightWeekday.everyday]
            ),
        )
        await self._send_command(cmd, 3)

    async def remove_setting(
        self,
        sunrise,
        sunset,
        ramp_up_in_minutes: int = 0,
        weekdays: list[commands.LightWeekday] | None = None,
    ) -> None:
        """Remove an automation setting from the light."""
        cmd = commands.create_delete_auto_setting_command(
            self.get_next_msg_id(),
            sunrise.time(),
            sunset.time(),
            ramp_up_in_minutes,
            commands.encode_light_weekdays(
                weekdays or [commands.LightWeekday.everyday]
            ),
        )
        await self._send_command(cmd, 3)

    async def reset_settings(self) -> None:
        """Remove all automation settings from the light."""
        cmd = commands.create_reset_auto_settings_command(
            self.get_next_msg_id()
        )
        await self._send_command(cmd, 3)

    async def enable_auto_mode(self) -> None:
        """Enable auto mode of the light."""
        switch_cmd = commands.create_switch_to_auto_mode_command(
            self.get_next_msg_id()
        )
        time_cmd = commands.create_set_time_command(self.get_next_msg_id())
        await self._send_command(switch_cmd, 3)
        await self._send_command(time_cmd, 3)

    async def set_manual_mode(self) -> None:
        """Switch to manual mode by sending a manual mode command."""
        for color_name in self._colors:
            await self.set_color_brightness(100, color_name)
