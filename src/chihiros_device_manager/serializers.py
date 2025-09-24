"""Serialization helpers for API responses.

These convert internal dataclasses into JSON-safe primitives.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict

from .doser_status import PumpStatus
from .light_status import ParsedLightStatus


def _serialize_pump_status(status: PumpStatus) -> Dict[str, Any]:
    """Convert a pump status dataclass into JSON-safe primitives."""
    data = asdict(status)
    # raw_payload and tail_raw are bytes; convert them to hex strings for JSON.
    data["raw_payload"] = (
        status.raw_payload.hex() if getattr(status, "raw_payload", None) else None
    )
    data["tail_raw"] = status.tail_raw.hex()
    for head in data["heads"]:
        head["extra"] = bytes(head["extra"]).hex()
    return data


def _serialize_light_status(status: ParsedLightStatus) -> Dict[str, Any]:
    """Convert a light status snapshot to a serializable dictionary."""
    data = {
        "message_id": status.message_id,
        "response_mode": status.response_mode,
        "weekday": status.weekday,
        "current_hour": status.current_hour,
        "current_minute": status.current_minute,
        # Include both the raw value (0..255) and a pre-computed percentage so the
        # frontend doesn't need to perform the conversion. Keep the original
        # fields for backward compatibility.
        "keyframes": [
            {
                **asdict(frame),
                "percent": (
                    int(round(frame.value))
                    if frame.value is not None and frame.value <= 100
                    else int(round((frame.value / 255) * 100))
                ),
            }
            for frame in status.keyframes
        ],
        "time_markers": status.time_markers,
        "tail": status.tail.hex(),
        # Preserve the original raw payload bytes for parity with pump
        # serialization. The frontend or diagnostic tooling may rely on
        # this to show the raw frame that produced the parsed view.
        "raw_payload": status.raw_payload.hex(),
    }
    return data


def cached_status_to_dict(service, status) -> Dict[str, Any]:
    """Transform a cached status into the API response structure."""
    connected = False
    if status.device_type == "doser":
        connected = service.current_doser_address() == status.address
    elif status.device_type == "light":
        connected = service.current_light_address() == status.address

    return {
        "address": status.address,
        "device_type": status.device_type,
        "raw_payload": status.raw_payload,
        "parsed": status.parsed,
        "updated_at": status.updated_at,
        "model_name": status.model_name,
        "connected": connected,
    }
