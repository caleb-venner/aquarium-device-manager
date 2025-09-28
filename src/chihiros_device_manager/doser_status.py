"""Utilities for parsing status payloads from the dosing pump."""

from __future__ import annotations

from dataclasses import dataclass


def _plausible_time(wd: int, hr: int, minute: int) -> bool:
    return 0 <= wd <= 7 and 0 <= hr <= 23 and 0 <= minute <= 59


def _minutes_distance(h1: int, m1: int, h2: int, m2: int) -> int:
    """Return minimal absolute distance in minutes between two HH:MM values.

    Computed modulo 24h so wrap-around at midnight is handled.
    """
    a = (h1 * 60 + m1) % (24 * 60)
    b = (h2 * 60 + m2) % (24 * 60)
    diff = abs(a - b)
    return min(diff, (24 * 60) - diff)


MODE_NAMES = {
    0x00: "daily",
    0x01: "24h",
    0x02: "custom",
    0x03: "timer",
    0x04: "disabled",
}


@dataclass(slots=True)
class HeadSnapshot:
    """Decoded information for a single head in the status frame."""

    mode: int
    hour: int
    minute: int
    dosed_tenths_ml: int
    extra: bytes
    # lifetime counters removed - we only keep per-head configuration and
    # dosed amount for the current day.

    def mode_label(self) -> str:
        """Return a human friendly mode name if known."""
        return MODE_NAMES.get(self.mode, f"0x{self.mode:02X}")

    def dosed_ml(self) -> float:
        """Return the ml already dispensed today."""
        return self.dosed_tenths_ml / 10


@dataclass(slots=True)
class DoserStatus:
    """High level representation of a status notification."""

    message_id: tuple[int, int] | None
    response_mode: int | None
    weekday: int | None
    hour: int | None
    minute: int | None
    heads: list[HeadSnapshot]
    tail_targets: list[int]
    tail_flag: int | None
    tail_raw: bytes
    # Preserve the original raw payload bytes so callers can access the
    # underlying frame when necessary (keeps parity with ParsedLightStatus).
    raw_payload: bytes = b""


def parse_status_payload(payload: bytes) -> DoserStatus:
    """Parse the 0xFE status notification from the pump.

    The function accepts either the full UART frame (starting with 0x5B) or
    the trimmed body (legacy behaviour).
    """
    if not payload:
        raise ValueError("payload too short")

    message_id: tuple[int, int] | None = None
    response_mode: int | None = None
    weekday: int | None = None
    hour: int | None = None
    minute: int | None = None

    body = payload
    if payload[0] == 0x5B:
        if len(payload) < 9:
            raise ValueError("payload too short")
        message_id = (payload[3], payload[4])
        response_mode = payload[5]
        # Some notification fragments (counters / totals) include the UART
        # header and response_mode but omit the weekday/time fields; in that
        # case the body begins immediately after response_mode. Detect this
        # by validating the weekday/hour/minute plausibility; weekdays are
        # expected 0-6 and hour 0-23, minute 0-59. If the values are outside
        # these ranges treat the fragment as header-only and start the body
        # earlier so counters/tail bytes are parsed correctly.
        response_mode = payload[5]
        maybe_wd = payload[6]
        maybe_hr = payload[7]
        maybe_min = payload[8]
        if not _plausible_time(maybe_wd, maybe_hr, maybe_min):
            # Header contains no weekday/time; body starts at payload[6]
            weekday = None
            hour = None
            minute = None
            body = payload[6:]
        else:
            weekday = maybe_wd
            hour = maybe_hr
            minute = maybe_min
            body = payload[9:]
            # Some frames include filler bytes before a second copy of the
            # weekday/hour/minute at the start of the body. If present, and
            # within ±1 minute of the header timestamp, skip up to and
            # including that triplet so we don't accidentally parse the filler
            # as the first head block.
            if (
                len(body) >= 3
                and weekday is not None
                and hour is not None
                and minute is not None
            ):
                scan_limit = min(32, len(body) - 2)
                adjusted_start = None
                for off in range(0, scan_limit):
                    wd2, hr2, min2 = body[off], body[off + 1], body[off + 2]
                    if (
                        _plausible_time(wd2, hr2, min2)
                        and _minutes_distance(hour, minute, hr2, min2) <= 1
                    ):
                        adjusted_start = off + 3
                        break
                if adjusted_start is not None and adjusted_start > 0:
                    body = body[adjusted_start:]
    else:
        if len(payload) < 3:
            raise ValueError("payload too short")
        weekday, hour, minute = payload[0], payload[1], payload[2]
        body = payload[3:]

    # Split tail (configured daily targets) from per-head blocks
    tail_raw = b""
    if len(body) >= 5:
        tail_raw = body[-5:]
        head_bytes = body[:-5]
    else:
        head_bytes = body

    heads: list[HeadSnapshot] = []
    for idx in range(0, min(len(head_bytes), 9 * 4), 9):
        end_index = idx + 9
        chunk = head_bytes[idx:end_index]
        if len(chunk) < 9:
            break
        heads.append(
            HeadSnapshot(
                mode=chunk[0],
                hour=chunk[1],
                minute=chunk[2],
                extra=chunk[3:7],
                dosed_tenths_ml=(chunk[7] << 8) | chunk[8],
            )
        )

    tail_targets: list[int] = []
    tail_flag: int | None = None
    if tail_raw:
        tail_targets = list(tail_raw[:4])
        if len(tail_raw) > 4:
            tail_flag = tail_raw[4]

    # lifetime counters removed; ignore counter-style fragments entirely.

    return DoserStatus(
        message_id=message_id,
        response_mode=response_mode,
        weekday=weekday,
        hour=hour,
        minute=minute,
        heads=heads,
        tail_targets=tail_targets,
        tail_flag=tail_flag,
        tail_raw=tail_raw,
        raw_payload=payload,
    )
