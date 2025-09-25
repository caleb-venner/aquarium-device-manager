"""Pydantic models for request payloads."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from . import doser_commands


class ConnectRequest(BaseModel):
    """Payload for connecting a device to the service."""

    address: str


class DoserScheduleRequest(BaseModel):
    """Request model for updating or creating a dosing schedule."""

    head_index: int = Field(..., ge=0, le=3)
    volume_tenths_ml: int = Field(..., ge=0, le=0xFF)
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(..., ge=0, le=59)
    weekdays: list[doser_commands.Weekday] | None = None
    confirm: bool = False
    wait_seconds: float = Field(1.5, ge=0.0, le=30.0)

    @field_validator("weekdays", mode="before")
    def _normalize_weekdays(cls, value: Any) -> Any:
        if value is None or value == []:
            return None
        if isinstance(value, doser_commands.Weekday):
            return [value]
        if isinstance(value, (str, int)):
            value = [value]
        if isinstance(value, (set, tuple)):
            value = list(value)
        if isinstance(value, list):
            parsed: list[doser_commands.Weekday] = []
            for item in value:
                if isinstance(item, doser_commands.Weekday):
                    parsed.append(item)
                    continue
                if isinstance(item, str):
                    name = item.strip().lower()
                    try:
                        parsed.append(getattr(doser_commands.Weekday, name))
                        continue
                    except AttributeError as exc:
                        raise ValueError(f"Unknown weekday '{item}'") from exc
                if isinstance(item, int):
                    try:
                        parsed.append(doser_commands.Weekday(item))
                        continue
                    except ValueError as exc:
                        raise ValueError(
                            f"Invalid weekday value '{item}'"
                        ) from exc
                raise ValueError(
                    "Weekday entries must be strings, integers, or "
                    "Weekday enum values"
                )
            return parsed
        raise ValueError("Weekdays must be provided as a sequence")


class LightBrightnessRequest(BaseModel):
    """Request model for setting light brightness or colour."""

    brightness: int = Field(..., ge=0, le=100)
    color: str | int = 0
