"""Utilities for parsing status payloads from the dosing pump."""

from __future__ import annotations

from dataclasses import dataclass

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
    lifetime_tenths_ml: int | None = None

    def mode_label(self) -> str:
        """Return a human friendly mode name if known."""
        return MODE_NAMES.get(self.mode, f"0x{self.mode:02X}")

    def dosed_ml(self) -> float:
        """Return the ml already dispensed today."""
        return self.dosed_tenths_ml / 10


@dataclass(slots=True)
class PumpStatus:
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
    lifetime_totals: list[int]


def parse_status_payload(payload: bytes) -> PumpStatus:
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
        weekday = payload[6]
        hour = payload[7]
        minute = payload[8]
        body = payload[9:]
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

    lifetime_totals: list[int] = []
    if body and body[0] == 0x01 and response_mode not in (0xFE, None):
        # payload shape for 0x1E/0x22 notifications
        counters = [
            (body[i] << 8) | body[i + 1]
            for i in range(1, min(len(body), 9), 2)
            if i + 1 < len(body)
        ]
        lifetime_totals = counters[:4]
        for head, total in zip(heads, lifetime_totals):
            head.lifetime_tenths_ml = total

    return PumpStatus(
        message_id=message_id,
        response_mode=response_mode,
        weekday=weekday,
        hour=hour,
        minute=minute,
        heads=heads,
        tail_targets=tail_targets,
        tail_flag=tail_flag,
        tail_raw=tail_raw,
        lifetime_totals=lifetime_totals,
    )
