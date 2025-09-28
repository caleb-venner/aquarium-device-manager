"""Serialization helpers for API responses.

These convert internal dataclasses into JSON-safe primitives.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict

from .doser_status import DoserStatus
from .light_status import ParsedLightStatus


def serialize_doser_status(status: DoserStatus) -> Dict[str, Any]:
    """Convert a dosing status dataclass into JSON-safe primitives.

    Notes:
    - The top-level CachedStatus already carries the raw_payload as hex.
      To avoid duplication, we omit raw_payload from the nested parsed dict.
    """
    data = asdict(status)
    # Remove raw_payload from parsed to avoid duplication and non-JSON bytes
    if "raw_payload" in data:
        data.pop("raw_payload", None)
    # Convert remaining byte fields to hex strings
    data["tail_raw"] = status.tail_raw.hex()
    # Enrich per-head data with hex-encoded extras and human-friendly mode name
    for head_dict, head_obj in zip(data["heads"], status.heads):
        head_dict["extra"] = bytes(head_dict["extra"]).hex()
        # Include a friendly mode label alongside the numeric mode
        try:
            head_dict["mode_label"] = head_obj.mode_label()
        except (
            Exception
        ):  # pragma: no cover - defensive; mode_label should exist
            head_dict["mode_label"] = f"0x{head_dict.get('mode', 0):02X}"
    return data


def serialize_light_status(status: ParsedLightStatus) -> Dict[str, Any]:
    """Convert a light status snapshot to a serializable dictionary.

    Notes:
    - Omit raw_payload from parsed to prevent duplication; it is available at
      the CachedStatus top level.
    """
    data = {
        "message_id": status.message_id,
        "response_mode": status.response_mode,
        "weekday": status.weekday,
        "current_hour": status.current_hour,
        "current_minute": status.current_minute,
        # Include both the raw value (0..255) and a pre-computed percentage so
        # the frontend doesn't need to perform the conversion. Keep the
        # original fields for backward compatibility.
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
    }
    return data


def cached_status_to_dict(service, status) -> Dict[str, Any]:
    """Transform a cached status into the API response structure."""
    connected = (
        service.current_device_address(status.device_type) == status.address
    )

    return {
        "address": status.address,
        "device_type": status.device_type,
        "raw_payload": status.raw_payload,
        "parsed": status.parsed,
        "updated_at": status.updated_at,
        "model_name": status.model_name,
        "connected": connected,
        "channels": status.channels,
    }
