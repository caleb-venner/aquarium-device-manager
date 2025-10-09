"""Module defining a base device class."""

import abc
import asyncio
import logging
import time
from abc import ABC
from typing import ClassVar, Optional

from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData
from bleak.backends.service import BleakGATTCharacteristic  # type: ignore
from bleak.backends.service import BleakGATTServiceCollection
from bleak.exc import BleakDBusError
from bleak_retry_connector import BLEAK_RETRY_EXCEPTIONS as BLEAK_EXCEPTIONS
from bleak_retry_connector import BleakError  # type: ignore
from bleak_retry_connector import (
    BleakClientWithServiceCache,
    BleakNotFoundError,
    establish_connection,
    retry_bluetooth_connection_error,
)

from ..commands import encoder as commands
from ..config_migration import get_env_float, get_env_int
from ..const import UART_RX_CHAR_UUID, UART_TX_CHAR_UUID
from ..exception import CharacteristicMissingError

DEFAULT_ATTEMPTS = 3

DISCONNECT_DELAY = 120
BLEAK_BACKOFF_TIME = 0.25

# Message ID session management constants (configurable via environment)
MESSAGE_ID_RESET_INTERVAL_HOURS = get_env_float("AQUA_MSG_ID_RESET_HOURS", 24.0)
MESSAGE_ID_MAX_SESSION_COMMANDS = get_env_int("AQUA_MSG_ID_MAX_COMMANDS", 1000)


class _classproperty:
    """A descriptor that works like @property but for class attributes."""

    def __init__(self, func):
        self.func = func

    def __get__(self, _instance, owner):  # type: ignore[unused-argument]
        if self.func is None:
            raise AttributeError("classproperty has no getter")
        return self.func(owner)


class BaseDevice(ABC):
    """Base device class used by device classes."""

    device_kind: ClassVar[str] = "device"
    status_serializer: ClassVar[Optional[str]] = None

    _model_name: str | None = None
    _model_codes: list[str] = []
    _colors: dict[str, int] = {}
    _msg_id = commands.next_message_id()
    _logger: logging.Logger

    def __init__(
        self,
        ble_device: BLEDevice,
        advertisement_data: AdvertisementData | None = None,
    ) -> None:
        """Create a new device."""
        self._ble_device = ble_device
        self._logger = logging.getLogger(ble_device.address.replace(":", "-"))
        self._advertisement_data = advertisement_data
        self._client: BleakClientWithServiceCache | None = None
        self._disconnect_timer: asyncio.TimerHandle | None = None
        self._operation_lock: asyncio.Lock = asyncio.Lock()
        self._read_char: BleakGATTCharacteristic | None = None
        self._write_char: BleakGATTCharacteristic | None = None
        self._connect_lock: asyncio.Lock = asyncio.Lock()
        self._expected_disconnect = False
        self.loop = asyncio.get_running_loop()
        assert self._model_name is not None

        # Message ID session management
        self._session_start_time = time.time()
        self._session_command_count = 0

    # Base methods

    def set_log_level(self, level: int | str) -> None:
        """Set log level."""
        if isinstance(level, str):
            # default INFO
            level = logging._nameToLevel.get(level, 20)
        self._logger.setLevel(level)

    def set_ble_device_and_advertisement_data(
        self, ble_device: BLEDevice, advertisement_data: AdvertisementData
    ) -> None:
        """Set the ble device."""
        self._ble_device = ble_device
        self._advertisement_data = advertisement_data

    @property
    def current_msg_id(self) -> tuple[int, int]:
        """Get current message id."""
        return self._msg_id

    def get_next_msg_id(self) -> tuple[int, int]:
        """Get next message id with session management."""
        # Check if we should reset message ID based on session duration or command count
        current_time = time.time()
        session_duration_hours = (
            current_time - self._session_start_time
        ) / 3600

        if (
            session_duration_hours >= MESSAGE_ID_RESET_INTERVAL_HOURS
            or self._session_command_count >= MESSAGE_ID_MAX_SESSION_COMMANDS
        ):
            self._reset_message_id_session()
            self._logger.info(
                "Reset message ID session after %.1f hours and %d commands",
                session_duration_hours,
                self._session_command_count,
            )

        self._session_command_count += 1
        self._msg_id = commands.next_message_id(self._msg_id)
        return self._msg_id

    def reset_msg_id(self) -> None:
        """Reset message ID to start of new session.

        Useful for long-running applications to avoid potential
        ID collision issues in extended sessions.
        """
        self._reset_message_id_session()

    def _reset_message_id_session(self) -> None:
        """Reset message ID and session tracking to start of new session."""
        self._msg_id = commands.reset_message_id()
        self._session_start_time = time.time()
        self._session_command_count = 0

    def is_msg_id_exhausted(self) -> bool:
        """Check if message ID is approaching exhaustion.

        Returns:
            True if message ID is in the last 10% of available values
        """
        return commands.is_message_id_exhausted(self._msg_id)

    def get_session_info(
        self,
    ) -> dict[str, float | int | tuple[int, int] | bool]:
        """Get information about the current message ID session.

        Returns:
            Dictionary with session start time, command count, and duration
        """
        current_time = time.time()
        return {
            "session_start_time": self._session_start_time,
            "session_duration_hours": (current_time - self._session_start_time)
            / 3600,
            "session_command_count": self._session_command_count,
            "message_id": self._msg_id,
            "message_id_exhausted": self.is_msg_id_exhausted(),
        }

    @_classproperty
    def model_name(self) -> str | None:
        """Get the model of the device."""
        return self._model_name

    @_classproperty
    def model_codes(self) -> list[str]:
        """Return the model codes."""
        return self._model_codes

    @property
    def colors(self) -> dict[str, int]:
        """Return the colors."""
        return self._colors

    @property
    def address(self) -> str:
        """Return the address."""
        return self._ble_device.address

    @property
    def name(self) -> str:
        """Get the name of the device."""
        if hasattr(self._ble_device, "name"):
            return self._ble_device.name or self._ble_device.address
        return self._ble_device.address

    @property
    def rssi(self) -> int | None:
        """Get the rssi of the device."""
        if self._advertisement_data:
            return self._advertisement_data.rssi
        return None

    # Abstract methods for subclasses

    @abc.abstractmethod
    async def request_status(self) -> None:
        """Send a request to the device to get its current status."""
        pass

    # Command methods

    # Bluetooth methods

    async def _send_command(
        self,
        commands: list[bytes] | bytes | bytearray,
        retry: int | None = None,
    ) -> None:
        """Send command to device and read response."""
        await self._ensure_connected()
        # await self._resolve_protocol()
        if not isinstance(commands, list):
            commands = [commands]
        await self._send_command_while_connected(commands, retry)

    async def _send_command_while_connected(
        self, commands: list[bytes], retry: int | None = None
    ) -> None:
        """Send command to device and read response."""
        self._logger.debug(
            "%s: Sending commands %s",
            self.name,
            [command.hex() for command in commands],
        )
        if self._operation_lock.locked():
            self._logger.debug(
                "%s: Operation already in progress; waiting. RSSI: %s",
                self.name,
                self.rssi,
            )
        async with self._operation_lock:
            try:
                await self._send_command_locked(commands)
                return
            except BleakNotFoundError:
                self._logger.error(
                    "%s: device missing or out of range. RSSI: %s",
                    self.name,
                    self.rssi,
                    exc_info=True,
                )
                raise
            except CharacteristicMissingError as ex:
                self._logger.debug(
                    "%s: characteristic missing (%s). RSSI: %s",
                    self.name,
                    ex,
                    self.rssi,
                    exc_info=True,
                )
                raise
            except BLEAK_EXCEPTIONS:
                self._logger.debug(
                    "%s: communication failed", self.name, exc_info=True
                )
                raise

        raise RuntimeError("Unreachable")

    @retry_bluetooth_connection_error(DEFAULT_ATTEMPTS)
    async def _send_command_locked(self, commands: list[bytes]) -> None:
        """Send command to device and read response."""
        try:
            await self._execute_command_locked(commands)
        except BleakDBusError as ex:
            # Disconnect so we can reset state and try again
            await asyncio.sleep(BLEAK_BACKOFF_TIME)
            self._logger.debug(
                "%s: RSSI: %s; backing off %.2fs due to error %s",
                self.name,
                self.rssi,
                BLEAK_BACKOFF_TIME,
                ex,
            )
            await self._execute_disconnect()
            raise
        except BleakError as ex:
            # Disconnect so we can reset state and try again
            self._logger.debug(
                "%s: RSSI: %s; disconnecting due to error %s",
                self.name,
                self.rssi,
                ex,
            )
            await self._execute_disconnect()
            raise

    async def _execute_command_locked(self, commands: list[bytes]) -> None:
        """Execute command and read response."""
        assert self._client is not None  # nosec
        if not self._read_char:
            raise CharacteristicMissingError("Read characteristic missing")
        if not self._write_char:
            raise CharacteristicMissingError("Write characteristic missing")
        for command in commands:
            await self._client.write_gatt_char(
                self._write_char,
                command,
                False,
            )

    def _notification_handler(
        self, _sender: BleakGATTCharacteristic, data: bytearray
    ) -> None:
        """Handle notification responses."""
        self._logger.warning("%s: Notification received: %s", self.name, data)

    def _disconnected(self, client: BleakClientWithServiceCache) -> None:
        """Disconnected callback."""
        if self._expected_disconnect:
            self._logger.debug(
                "%s: Disconnected from device; RSSI: %s", self.name, self.rssi
            )
            return
        self._logger.warning(
            "%s: Device unexpectedly disconnected; RSSI: %s",
            self.name,
            self.rssi,
        )

    def _resolve_characteristics(
        self, services: BleakGATTServiceCollection
    ) -> bool:
        """Resolve characteristics."""
        for characteristic in [UART_TX_CHAR_UUID]:
            if char := services.get_characteristic(characteristic):
                self._read_char = char
                break
        for characteristic in [UART_RX_CHAR_UUID]:
            if char := services.get_characteristic(characteristic):
                self._write_char = char
                break
        return bool(self._read_char and self._write_char)

    async def _ensure_connected(self) -> None:
        """Ensure connection to device is established."""
        if self._connect_lock.locked():
            self._logger.debug(
                "%s: Connection already in progress; waiting. RSSI: %s",
                self.name,
                self.rssi,
            )
        if self._client and self._client.is_connected:
            self._reset_disconnect_timer()
            return
        async with self._connect_lock:
            # Check again while holding the lock
            if self._client and self._client.is_connected:
                self._reset_disconnect_timer()
                return
            self._logger.debug(
                "%s: Connecting; RSSI: %s",
                self.name,
                self.rssi,
            )
            client = await establish_connection(
                BleakClientWithServiceCache,
                self._ble_device,
                self.name,
                self._disconnected,
                use_services_cache=True,
                ble_device_callback=lambda: self._ble_device,
            )
            self._logger.debug(
                "%s: Connected; RSSI: %s",
                self.name,
                self.rssi,
            )
            resolved = self._resolve_characteristics(client.services)
            if not resolved:
                # Try to handle services failing to load
                resolved = self._resolve_characteristics(
                    await client.get_services()
                )

            self._client = client
            self._reset_disconnect_timer()

            self._logger.debug(
                "%s: Subscribe to notifications. RSSI: %s",
                self.name,
                self.rssi,
            )
            if self._read_char is not None:
                await client.start_notify(
                    self._read_char,
                    self._notification_handler,  # type: ignore[arg-type]
                )
            else:
                raise CharacteristicMissingError(
                    "Read characteristic not resolved"
                )

    def _reset_disconnect_timer(self) -> None:
        """Reset disconnect timer."""
        if self._disconnect_timer:
            self._disconnect_timer.cancel()
        self._expected_disconnect = False
        self._disconnect_timer = self.loop.call_later(
            DISCONNECT_DELAY, self._disconnect
        )

    async def disconnect(self) -> None:
        """Disconnect."""
        self._logger.debug("%s: Disconnecting", self.name)
        await self._execute_disconnect()

    async def _execute_disconnect(self) -> None:
        """Execute disconnection."""
        async with self._connect_lock:
            read_char = self._read_char
            client = self._client
            self._expected_disconnect = True
            self._client = None
            self._read_char = None
            self._write_char = None
            if client and client.is_connected:
                if read_char:
                    try:
                        await client.stop_notify(read_char)
                    except BleakError:
                        self._logger.debug(
                            "%s: Failed to stop notifications",
                            self.name,
                            exc_info=True,
                        )
                await client.disconnect()

    def _disconnect(self) -> None:
        """Disconnect from device."""
        self._disconnect_timer = None
        asyncio.create_task(self._execute_timed_disconnect())

    async def _execute_timed_disconnect(self) -> None:
        """Execute timed disconnection."""
        self._logger.debug(
            "%s: Disconnecting after timeout of %s",
            self.name,
            DISCONNECT_DELAY,
        )
        await self._execute_disconnect()
