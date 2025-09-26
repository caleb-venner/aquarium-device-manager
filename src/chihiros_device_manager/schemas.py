"""Define Pydantic models for request payloads."""

from __future__ import annotations

from datetime import time as _time
from typing import Any

from pydantic import BaseModel, Field, field_validator

from .commands import LightWeekday
from .commands import encoder as doser_commands


def _normalize_weekdays_generic(
    value: Any, enum_cls, default_if_none: Any = None
) -> Any:
    """Normalize weekdays used by multiple request models.

    Accepts None, single enum, string/int, set/tuple, or list of items.
    Returns either the provided `default_if_none` when value is None/[], or
    a list of enum members.
    """
    if value is None or value == []:
        return default_if_none
    if isinstance(value, enum_cls):
        return [value]
    if isinstance(value, (str, int)):
        value = [value]
    if isinstance(value, (set, tuple)):
        value = list(value)
    if isinstance(value, list):
        parsed: list[object] = []
        for item in value:
            if isinstance(item, enum_cls):
                parsed.append(item)
                continue
            if isinstance(item, str):
                name = item.strip().lower()
                try:
                    parsed.append(getattr(enum_cls, name))
                    continue
                except AttributeError as exc:
                    raise ValueError(f"Unknown weekday '{item}'") from exc
            if isinstance(item, int):
                try:
                    parsed.append(enum_cls(item))
                    continue
                except Exception as exc:
                    raise ValueError(f"Invalid weekday value '{item}'") from exc
            raise ValueError(
                "Weekday entries must be strings, integers, or enum values"
            )
        return parsed
    raise ValueError("Weekdays must be provided as a sequence")


class ConnectRequest(BaseModel):
    """Payload for connecting a device to the service."""

    address: str


class DoserScheduleRequest(BaseModel):
    """Request model for updating or creating a dosing schedule."""

    head_index: int = Field(..., ge=0, le=3)
    volume_tenths_ml: int = Field(..., ge=0, le=0xFF)
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(..., ge=0, le=59)
    weekdays: list[doser_commands.PumpWeekday] | None = None
    confirm: bool = False
    wait_seconds: float = Field(1.5, ge=0.0, le=30.0)

    @field_validator("weekdays", mode="before")
    def _normalize_weekdays(cls, value: Any) -> Any:
        return _normalize_weekdays_generic(
            value, doser_commands.PumpWeekday, None
        )


class LightBrightnessRequest(BaseModel):
    """Request model for setting light brightness or colour."""

    brightness: int = Field(..., ge=0, le=100)
    color: str | int = 0


class LightAutoSettingRequest(BaseModel):
    """Request model for creating a light auto-mode schedule entry."""

    sunrise: _time
    sunset: _time
    # Allow either a single integer (0..100) for non-RGB lights or a
    # triple [r,g,b] for RGB lights (each 0..100).
    brightness: Any = Field(...)
    ramp_up_minutes: int = Field(0, ge=0, le=150)
    weekdays: list[LightWeekday] | None = None

    @field_validator("weekdays", mode="before")
    def _normalize_weekdays(cls, value: Any) -> Any:
        # Reuse the same semantics as DoserScheduleRequest but with the
        # WeekdaySelect enum defined for lights.
        return _normalize_weekdays_generic(
            value, LightWeekday, [LightWeekday.everyday]
        )

    @field_validator("brightness", mode="before")
    def _validate_brightness(cls, value: Any) -> Any:
        # Only validate the shape and types. Do not coerce or clamp values
        # because some channels may legitimately use values >100 when others
        # are lower. We'll revisit more strict validation later.
        if isinstance(value, int):
            return value
        if isinstance(value, (list, tuple)):
            if len(value) != 3:
                raise ValueError(
                    "RGB brightness must be a sequence of three values"
                )
            vals = []
            for v in value:
                if not isinstance(v, int):
                    raise ValueError("RGB brightness values must be integers")
                vals.append(v)
            return tuple(vals)
        raise ValueError(
            "brightness must be an integer or a three-element sequence"
        )
