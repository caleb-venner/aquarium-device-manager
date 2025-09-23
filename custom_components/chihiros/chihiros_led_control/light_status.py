"""Helpers to parse WRGB light status payloads."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple


@dataclass(slots=True)
class LightKeyframe:
    """Single scheduled point (hour, minute, intensity)."""

    hour: int
    minute: int
    value: int

    def as_time(self) -> str:
        return f"{self.hour:02d}:{self.minute:02d}"


@dataclass(slots=True)
class ParsedLightStatus:
    """Decoded view of a WRGB status notification."""

    message_id: Optional[Tuple[int, int]]
    response_mode: Optional[int]
    weekday: Optional[int]
    current_hour: Optional[int]
    current_minute: Optional[int]
    keyframes: List[LightKeyframe]
    time_markers: List[Tuple[int, int]]
    tail: bytes
    raw_payload: bytes


def _split_body(payload: bytes) -> Tuple[Optional[Tuple[int, int]], Optional[int], Optional[int], Optional[int], Optional[int], bytes]:
    """Return header fields and body bytes."""

    message_id = response_mode = weekday = hour = minute = None
    body = payload
    if payload and payload[0] == 0x5B and len(payload) >= 9:
        message_id = (payload[3], payload[4])
        response_mode = payload[5]
        weekday = payload[6]
        hour = payload[7]
        minute = payload[8]
        body = payload[9:]
    return message_id, response_mode, weekday, hour, minute, body


def parse_light_status(payload: bytes) -> ParsedLightStatus:
    """Decode a WRGB status payload into keyframes and markers."""

    (
        message_id,
        response_mode,
        weekday,
        current_hour,
        current_minute,
        body,
    ) = _split_body(payload)

    tail = body[-5:] if len(body) >= 5 else b""
    body_bytes = body[:-5] if len(body) >= 5 else body

    keyframes: list[LightKeyframe] = []
    time_markers: list[tuple[int, int]] = []

    i = 0
    last_time: Optional[int] = None
    length = len(body_bytes)
    while i < length:
        remaining = length - i
        # Sentinel like 00 02 HH MM appears to mark the controller's current clock.
        if remaining >= 4 and body_bytes[i] == 0x00 and body_bytes[i + 1] == 0x02:
            time_markers.append((body_bytes[i + 2], body_bytes[i + 3]))
            i += 4
            continue

        if remaining < 3:
            break

        hour = body_bytes[i]
        minute = body_bytes[i + 1]
        value = body_bytes[i + 2]
        triple = (hour, minute, value)

        if triple == (0, 0, 0):
            # padding / unused slot
            i += 3
            continue

        total_minutes = hour * 60 + minute
        if last_time is not None and total_minutes < last_time:
            # Remaining entries appear to be artifacts; stop parsing further keyframes.
            break

        keyframes.append(LightKeyframe(hour=hour, minute=minute, value=value))
        last_time = total_minutes
        i += 3

    return ParsedLightStatus(
        message_id=message_id,
        response_mode=response_mode,
        weekday=weekday,
        current_hour=current_hour,
        current_minute=current_minute,
        keyframes=keyframes,
        time_markers=time_markers,
        tail=tail,
        raw_payload=payload,
    )
