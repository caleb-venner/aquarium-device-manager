"""Command builder helpers for the Chihiros dosing pump."""

from __future__ import annotations

from enum import IntFlag
from typing import Iterable, Sequence


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

    checksum = command[2]
    for value in command[3:]:
        checksum ^= value
    if checksum == 0x5A:
        checksum = 0x59

    command.append(checksum)
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


class Weekday(IntFlag):
    """Bitmask representing the pump's weekday selection order."""

    saturday = 1 << 0
    sunday = 1 << 1
    monday = 1 << 2
    tuesday = 1 << 3
    wednesday = 1 << 4
    thursday = 1 << 5
    friday = 1 << 6


WEEKDAY_ALL = (
    Weekday.monday
    | Weekday.tuesday
    | Weekday.wednesday
    | Weekday.thursday
    | Weekday.friday
    | Weekday.saturday
    | Weekday.sunday
)


def encode_weekdays(weekdays: Sequence[Weekday] | Weekday | None) -> int:
    """Convert a collection of weekdays into the pump bitmask."""

    if weekdays is None:
        return int(WEEKDAY_ALL)
    if isinstance(weekdays, Weekday):
        return int(weekdays)
    mask = Weekday(0)
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
    """Create the mode 0x1B command that sets weekday mask and daily dose."""

    if not 0 <= volume_tenths_ml <= 0xFF:
        raise ValueError("volume_tenths_ml must fit in one byte")
    if not 0 <= weekday_mask <= 0x7F:
        raise ValueError("weekday_mask must be a 7-bit value")
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
