"""Command system models for device command execution and persistence."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

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
    color: int = Field(0, ge=0, le=5, description="Channel/color index")


class DoserScheduleArgs(BaseModel):
    """Arguments for set_schedule command."""

    head_index: int = Field(..., ge=0, le=3)
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


class LightAutoSettingArgs(BaseModel):
    """Arguments for add_auto_setting command."""

    sunrise: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    sunset: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    brightness: int = Field(..., ge=0, le=100)
    ramp_up_minutes: int = Field(0, ge=0)
    weekdays: Optional[list[LightWeekday]] = Field(
        None, description="List of weekdays"
    )


# Command argument validation mapping
COMMAND_ARG_SCHEMAS = {
    "set_brightness": LightBrightnessArgs,
    "set_schedule": DoserScheduleArgs,
    "add_auto_setting": LightAutoSettingArgs,
    # Actions without arguments
    "turn_on": None,
    "turn_off": None,
    "enable_auto_mode": None,
    "set_manual_mode": None,
    "reset_auto_settings": None,
}
