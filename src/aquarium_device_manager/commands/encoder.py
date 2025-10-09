"""Command encoders and related helpers for Chihiros devices."""

import datetime
from enum import Enum, IntFlag
from typing import Iterable, List, Sequence


def next_message_id(
    current_msg_id: tuple[int, int] = (0, 0)
) -> tuple[int, int]:
    """Return the next message id pair, avoiding reserved values.

    The encoder uses two-byte message ids that skip 0x5A/90 in both
    positions. This helper encapsulates that wrap/skip behaviour.
    """
    msg_id_higher_byte, msg_id_lower_byte = current_msg_id
    if msg_id_lower_byte == 255:
        if msg_id_higher_byte == 255:
            # start counting from the beginning
            return (0, 1)
        if msg_id_higher_byte == 89:
            # higher byte should never be 90
            return (msg_id_higher_byte + 2, msg_id_lower_byte)
        return (msg_id_higher_byte + 1, 0)
    else:
        if msg_id_lower_byte == 89:
            # lower byte should never be 90
            return (0, msg_id_lower_byte + 2)
        return (0, msg_id_lower_byte + 1)


def _calculate_checksum(input_bytes: bytes) -> int:
    """Calculate XOR-based checksum used by the light command encoder.

    This checksum starts with the second byte and XORs all subsequent
    bytes. The function name was previously `_calculate_light_checksum` but
    is generalized now since it is the canonical checksum for the encoder
    command framing.
    """
    assert len(input_bytes) >= 7  # commands are always at least 7 bytes long
    checksum = input_bytes[1]
    for input_byte in input_bytes[2:]:
        checksum = checksum ^ input_byte
    return checksum


def _encode_timestamp(ts: datetime.datetime) -> list[int]:
    """Encode a datetime into the device timestamp byte sequence."""
    # note: day is weekday e.g. 3 for wednesday
    return [
        ts.year - 2000,
        ts.month,
        ts.isoweekday(),
        ts.hour,
        ts.minute,
        ts.second,
    ]


def create_set_time_command(msg_id: tuple[int, int]) -> bytearray:
    """Build a set-time UART command for the device."""
    return _encode_uart_command(
        90, 9, msg_id, _encode_timestamp(datetime.datetime.now())
    )


def create_manual_setting_command(
    msg_id: tuple[int, int], color: int, brightness_level: int
) -> bytearray:
    """Create a manual color/brightness setting command."""
    return _encode_uart_command(90, 7, msg_id, [color, brightness_level])


def create_add_auto_setting_command(
    msg_id: tuple[int, int],
    sunrise: datetime.time,
    sunset: datetime.time,
    brightness: tuple[int, int, int],
    ramp_up_minutes: int,
    weekdays: int,
) -> bytearray:
    """Create a command to add an auto program to a light device."""
    parameters = [
        sunrise.hour,
        sunrise.minute,
        sunset.hour,
        sunset.minute,
        ramp_up_minutes,
        weekdays,
        *brightness,
        255,
        255,
        255,
        255,
        255,
    ]

    return _encode_uart_command(165, 25, msg_id, parameters)


def create_delete_auto_setting_command(
    msg_id: tuple[int, int],
    sunrise: datetime.time,
    sunset: datetime.time,
    ramp_up_minutes: int,
    weekdays: int,
) -> bytearray:
    """Create a delete-auto-setting command (encoded via add with 255s)."""
    return create_add_auto_setting_command(
        msg_id, sunrise, sunset, (255, 255, 255), ramp_up_minutes, weekdays
    )


def create_reset_auto_settings_command(msg_id: tuple[int, int]) -> bytearray:
    """Return a command to reset auto settings on the device."""
    return _encode_uart_command(90, 5, msg_id, [5, 255, 255])


def create_switch_to_auto_mode_command(msg_id: tuple[int, int]) -> bytearray:
    """Return a command switching the light to auto mode."""
    return _encode_uart_command(90, 5, msg_id, [18, 255, 255])


def create_status_request_command(msg_id: tuple[int, int]) -> bytearray:
    """Build a status request command frame."""
    return _encode_uart_command(0x5A, 0x04, msg_id, [0x01])


class LightWeekday(str, Enum):
    """Enum for human-readable weekday selections used by light commands."""

    monday = "monday"
    tuesday = "tuesday"
    wednesday = "wednesday"
    thursday = "thursday"
    friday = "friday"
    saturday = "saturday"
    sunday = "sunday"
    everyday = "everyday"


def encode_light_weekdays(selection: List[LightWeekday]) -> int:
    """Encode a list of light-style weekday selections into a 7-bit mask.

    This ordering is used by the light protocol where Monday maps to bit 6
    and Sunday maps to bit 0. Use `encode_pump_weekdays` for pump/doser masks.
    """
    encoding = 0
    if LightWeekday.everyday in selection:
        return 127
    if LightWeekday.monday in selection:
        encoding += 64
    if LightWeekday.tuesday in selection:
        encoding += 32
    if LightWeekday.wednesday in selection:
        encoding += 16
    if LightWeekday.thursday in selection:
        encoding += 8
    if LightWeekday.friday in selection:
        encoding += 4
    if LightWeekday.saturday in selection:
        encoding += 2
    if LightWeekday.sunday in selection:
        encoding += 1
    return encoding


def _encode_uart_command(
    cmd_id: int, mode: int, msg_id: tuple[int, int], params: Iterable[int]
) -> bytearray:
    """Return a UART frame compatible with the pump protocol."""
    msg_hi, msg_lo = msg_id
    payload = list(params)
    sanitized = [(value if value != 0x5A else 0x59) for value in payload]

    command = bytearray(
        [cmd_id, 0x01, len(sanitized) + 5, msg_hi, msg_lo, mode]
    )
    command.extend(sanitized)

    verification_byte = _calculate_checksum(command)
    if verification_byte == 0x5A:
        # bump the message id using the canonical helper and retry
        new_msg_id = next_message_id(msg_id)
        return _encode_uart_command(cmd_id, mode, new_msg_id, params)

    command.append(verification_byte)
    return command


def create_handshake_command(msg_id: tuple[int, int]) -> bytearray:
    """Build the initial status request (0x5A / mode 0x04)."""
    return _encode_uart_command(0x5A, 0x04, msg_id, [0x01])


def create_prepare_command(msg_id: tuple[int, int], stage: int) -> bytearray:
    """Return the 0xA5 / mode 0x04 command used before configuration writes."""
    if stage not in (0x04, 0x05):
        raise ValueError("stage must be 0x04 or 0x05")
    return _encode_uart_command(0xA5, 0x04, msg_id, [stage])


def create_head_select_command(
    msg_id: tuple[int, int],
    head_index: int,
    *,
    flag1: int = 0x00,
    flag2: int = 0x01,
) -> bytearray:
    """Select the dosing head that will be modified next (mode 0x20)."""
    if not 0 <= head_index <= 0x03:
        raise ValueError("head_index must be between 0 and 3")
    return _encode_uart_command(0xA5, 0x20, msg_id, [head_index, flag1, flag2])


class PumpWeekday(IntFlag):
    """Bitmask representing the pump's weekday selection order."""

    saturday = 1 << 0
    sunday = 1 << 1
    monday = 1 << 2
    tuesday = 1 << 3
    wednesday = 1 << 4
    thursday = 1 << 5
    friday = 1 << 6
    everyday = 0x7F


def encode_pump_weekdays(
    weekdays: Sequence[PumpWeekday] | PumpWeekday | None,
) -> int:
    """Convert a collection of pump/doser weekdays into the pump bitmask.

    The pump expects saturday as the LSB (bit 0) through friday as bit 6.
    Accepts `None` (all days), a single `Weekday`, or a sequence of `Weekday`.
    """
    if weekdays is None:
        return int(PumpWeekday.everyday)
    if isinstance(weekdays, PumpWeekday):
        return int(weekdays)
    mask = PumpWeekday(0)
    for day in weekdays:
        mask |= day
    return int(mask)


def create_head_dose_command(
    msg_id: tuple[int, int],
    head_index: int,
    volume_tenths_ml: int,
    *,
    weekday_mask: int,
    schedule_mode: int = 0x01,
    repeat_flag: int = 0x01,
    reserved: int = 0x00,
) -> bytearray:
    """Create the mode 0x1B command that sets weekday mask and daily dose.

    Now supports volumes up to 6553.5mL (65535 tenths) using 2-byte encoding.
    Values <= 255 use legacy 1-byte format for backward compatibility.
    Values > 255 use new 2-byte format.
    """
    if not 0 <= volume_tenths_ml <= 0xFFFF:
        raise ValueError("volume_tenths_ml must fit in two bytes (0-65535)")
    if not 0 <= weekday_mask <= 0x7F:
        raise ValueError("weekday_mask must be a 7-bit value")

    # Use 2-byte encoding for volumes > 255, otherwise keep legacy 1-byte format
    if volume_tenths_ml <= 0xFF:
        # Legacy 1-byte format for backward compatibility
        return _encode_uart_command(
            0xA5,
            0x1B,
            msg_id,
            [
                head_index,
                weekday_mask,
                schedule_mode,
                repeat_flag,
                reserved,
                volume_tenths_ml,
            ],
        )
    else:
        # New 2-byte format for larger volumes
        # Split volume into high and low bytes (big-endian)
        volume_high = (volume_tenths_ml >> 8) & 0xFF
        volume_low = volume_tenths_ml & 0xFF
        return _encode_uart_command(
            0xA5,
            0x1C,  # New mode for 2-byte volume encoding
            msg_id,
            [
                head_index,
                weekday_mask,
                schedule_mode,
                repeat_flag,
                reserved,
                volume_high,
                volume_low,
            ],
        )


def create_head_schedule_command(
    msg_id: tuple[int, int],
    head_index: int,
    hour: int,
    minute: int,
    *,
    reserve1: int = 0x00,
    reserve2: int = 0x00,
) -> bytearray:
    """Create the mode 0x15 command that sets the daily schedule time."""
    if not 0 <= hour <= 23:
        raise ValueError("hour must be 0-23")
    if not 0 <= minute <= 59:
        raise ValueError("minute must be 0-59")
    return _encode_uart_command(
        0xA5,
        0x15,
        msg_id,
        [head_index, reserve1, hour, minute, reserve2, 0x00],
    )
