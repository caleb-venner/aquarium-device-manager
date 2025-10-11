"""Command system models for device command execution and persistence."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .commands.encoder import LightWeekday, PumpWeekday

# Command status types
CommandStatus = Literal[
    "pending", "running", "success", "failed", "timed_out", "cancelled"
]


class CommandRequest(BaseModel):
    """Incoming command request from client."""

    id: Optional[str] = Field(
        None, description="Optional client idempotency token"
    )
    action: str = Field(..., description="Command action to execute")
    args: Optional[Dict[str, Any]] = Field(
        None, description="Action-specific parameters"
    )
    timeout: Optional[float] = Field(
        None, ge=1.0, le=30.0, description="Command timeout in seconds"
    )


@dataclass
class CommandRecord:
    """Persistent record of a command execution."""

    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    address: str = ""
    action: str = ""
    args: Optional[Dict[str, Any]] = None
    status: CommandStatus = "pending"
    attempts: int = 0
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    timeout: float = 10.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "address": self.address,
            "action": self.action,
            "args": self.args,
            "status": self.status,
            "attempts": self.attempts,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "timeout": self.timeout,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CommandRecord:
        """Create from dictionary loaded from JSON."""
        return cls(
            id=data.get("id", ""),
            address=data.get("address", ""),
            action=data.get("action", ""),
            args=data.get("args"),
            status=data.get("status", "pending"),
            attempts=data.get("attempts", 0),
            result=data.get("result"),
            error=data.get("error"),
            created_at=data.get("created_at", 0.0),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            timeout=data.get("timeout", 10.0),
        )

    def mark_started(self) -> None:
        """Mark command as started."""
        self.status = "running"
        self.started_at = time.time()
        self.attempts += 1

    def mark_success(self, result: Optional[Dict[str, Any]] = None) -> None:
        """Mark command as successful."""
        self.status = "success"
        self.result = result
        self.completed_at = time.time()

    def mark_failed(self, error: str) -> None:
        """Mark command as failed."""
        self.status = "failed"
        self.error = error
        self.completed_at = time.time()

    def mark_timeout(self) -> None:
        """Mark command as timed out."""
        self.status = "timed_out"
        self.error = "Command execution timed out"
        self.completed_at = time.time()

    def is_complete(self) -> bool:
        """Check if command execution is complete."""
        return self.status in {"success", "failed", "timed_out", "cancelled"}


# Supported command actions and their argument schemas
class LightBrightnessArgs(BaseModel):
    """Arguments for set_brightness command."""

    brightness: int = Field(..., ge=0, le=100)
    color: int = Field(..., description="Channel/color index")

    @field_validator("color")
    @classmethod
    def validate_color_index(cls, v: int) -> int:
        """Validate color/channel index for light devices.

        TODO: Make this validation device-aware based on device type/capabilities.
        For now, allow any non-negative integer as channel indices will be
        validated against actual device capabilities at command execution time.
        """
        if v < 0:
            raise ValueError(f"Color index must be non-negative, got {v}")
        return v


class LightMultiChannelBrightnessArgs(BaseModel):
    """Arguments for set_manual_multi_channel_brightness command."""

    channels: list[int] = Field(
        ...,
        min_length=1,
        max_length=4,
        description="List of brightness values (0-100) for each channel",
    )

    @field_validator("channels")
    @classmethod
    def validate_brightness_values(cls, v: list[int]) -> list[int]:
        """Validate brightness values are within valid range."""
        for i, brightness in enumerate(v):
            if not (0 <= brightness <= 100):
                raise ValueError(
                    f"Channel {i} brightness must be 0-100, got {brightness}"
                )
        return v


class DoserScheduleArgs(BaseModel):
    """Arguments for set_schedule command."""

    head_index: int = Field(..., description="Doser head index (0-3)")
    volume_tenths_ml: int = Field(
        ..., ge=0, le=65535, description="Volume in tenths of ml (0-6553.5ml)"
    )
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(..., ge=0, le=59)
    weekdays: Optional[list[PumpWeekday]] = Field(
        None, description="List of weekdays"
    )
    confirm: bool = Field(True)
    wait_seconds: float = Field(2.0, ge=0.5, le=10.0)

    @field_validator("head_index")
    @classmethod
    def validate_head_index(cls, v: int) -> int:
        """Validate head index for doser devices.

        Currently supports 4-head devices (indices 0-3).
        TODO: Add support for 2-head devices (indices 0-1).
        """
        if not (0 <= v <= 3):
            raise ValueError(
                f"Head index must be 0-3 for 4-head doser devices, got {v}"
            )
        return v

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(
        cls, v: Optional[list[PumpWeekday]]
    ) -> Optional[list[PumpWeekday]]:
        """Validate weekday selections."""
        if v is not None:
            if not v:
                raise ValueError("Weekdays list cannot be empty")

            # Check for invalid combinations
            if PumpWeekday.everyday in v and len(v) > 1:
                raise ValueError(
                    "Cannot combine 'everyday' with specific weekdays"
                )

            # Check for duplicates
            if len(v) != len(set(v)):
                raise ValueError("Duplicate weekdays not allowed")

        return v


class LightAutoSettingArgs(BaseModel):
    """Arguments for add_auto_setting command."""

    sunrise: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    sunset: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    brightness: Optional[int] = Field(
        None, ge=0, le=100, description="Single channel brightness (0-100)"
    )
    channels: Optional[dict[str, int]] = Field(
        None, description="Per-channel brightness values"
    )
    ramp_up_minutes: int = Field(0, description="Ramp up time in minutes")
    weekdays: Optional[list[LightWeekday]] = Field(
        None, description="List of weekdays"
    )

    @model_validator(mode="after")
    def validate_brightness_or_channels(self) -> "LightAutoSettingArgs":
        """Ensure either brightness or channels is provided, but not both."""
        if self.brightness is None and self.channels is None:
            raise ValueError(
                "Either 'brightness' or 'channels' must be provided"
            )
        if self.brightness is not None and self.channels is not None:
            raise ValueError("Cannot specify both 'brightness' and 'channels'")
        return self

    @field_validator("sunrise", "sunset")
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        """Validate that time strings represent valid hours and minutes."""
        try:
            hours, minutes = map(int, v.split(":"))
            if not (0 <= hours <= 23):
                raise ValueError(f"Hours must be 0-23, got {hours}")
            if not (0 <= minutes <= 59):
                raise ValueError(f"Minutes must be 0-59, got {minutes}")
        except ValueError as e:
            if "too many values to unpack" in str(
                e
            ) or "not enough values to unpack" in str(e):
                raise ValueError(f"Time must be in HH:MM format, got {v}")
            raise
        return v

    @field_validator("sunset")
    @classmethod
    def validate_sunset_after_sunrise(cls, v: str, info) -> str:
        """Validate that sunset is after sunrise."""
        if info.data.get("sunrise"):
            sunrise = info.data["sunrise"]
            if sunrise > v:
                raise ValueError(
                    f"Sunset ({v}) must be after sunrise ({sunrise})"
                )
        return v

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(
        cls, v: Optional[list[LightWeekday]]
    ) -> Optional[list[LightWeekday]]:
        """Validate weekday selections."""
        if v is not None:
            if not v:
                raise ValueError("Weekdays list cannot be empty")

            # Check for invalid combinations
            if LightWeekday.everyday in v and len(v) > 1:
                raise ValueError(
                    "Cannot combine 'everyday' with specific weekdays"
                )

            # Check for duplicates
            if len(v) != len(set(v)):
                raise ValueError("Duplicate weekdays not allowed")

        return v

    @field_validator("ramp_up_minutes")
    @classmethod
    def validate_ramp_time(cls, v: int, info) -> int:
        """Validate ramp up time is reasonable."""
        # Basic validation - ramp time should be positive
        if v < 0:
            raise ValueError("Ramp up minutes cannot be negative")

        # Check against sunrise/sunset span if available
        if info.data.get("sunrise") and info.data.get("sunset"):
            try:
                sunrise_hours, sunrise_mins = map(
                    int, info.data["sunrise"].split(":")
                )
                sunset_hours, sunset_mins = map(
                    int, info.data["sunset"].split(":")
                )

                sunrise_total_mins = sunrise_hours * 60 + sunrise_mins
                sunset_total_mins = sunset_hours * 60 + sunset_mins

                # Handle next-day sunset
                if sunset_total_mins <= sunrise_total_mins:
                    sunset_total_mins += 24 * 60

                span_minutes = sunset_total_mins - sunrise_total_mins

                if v > span_minutes:
                    raise ValueError(
                        f"Ramp up time ({v} minutes) cannot exceed "
                        f"sunrise-sunset span ({span_minutes} minutes)"
                    )
            except ValueError as e:
                # Check if this is our intentional validation error
                if "Ramp up time" in str(e):
                    raise  # Re-raise our validation error
                # Otherwise it's a parsing error, skip validation
                pass

        return v

    # TODO: Add overlap detection validation
    # This requires checking against existing auto settings on the device
    # and should be implemented at the command execution level, not model validation


# Command argument validation mapping
COMMAND_ARG_SCHEMAS = {
    "set_brightness": LightBrightnessArgs,
    "set_manual_multi_channel_brightness": LightMultiChannelBrightnessArgs,
    "set_schedule": DoserScheduleArgs,
    "add_auto_setting": LightAutoSettingArgs,
    # Actions without arguments
    "turn_on": None,
    "turn_off": None,
    "enable_auto_mode": None,
    "set_manual_mode": None,
    "reset_auto_settings": None,
}
