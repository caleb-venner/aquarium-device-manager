"""Persistent storage models and helpers for Chihiros dosing pumps.

This module mirrors the structure defined in ``tests/doser_structure.ts`` so that the
backend can validate and persist dosing pump configurations exactly as the
frontend expects them.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Literal, Sequence
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

Weekday = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
ModeKind = Literal["single", "every_hour", "custom_periods", "timer"]
TimeString = Field(pattern=r"^\d{2}:\d{2}$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _ensure_unique(values: Sequence[str], what: str) -> None:
    seen = set()
    duplicates = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        else:
            seen.add(value)
    if duplicates:
        plural = "s" if len(duplicates) > 1 else ""
        raise ValueError(f"Duplicate {what}{plural}: {sorted(duplicates)}")


class Recurrence(BaseModel):
    """Represents the weekdays a schedule runs on."""

    days: list[Weekday]

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_days(self) -> "Recurrence":
        """Validate recurrence days are present and unique."""
        if not self.days:
            raise ValueError("Recurrence must include at least one day")
        _ensure_unique(self.days, "weekday")
        return self


class VolumeTracking(BaseModel):
    """Volume tracking metadata for a dosing head."""

    enabled: bool
    capacityMl: float | None = Field(default=None, ge=0)
    currentMl: float | None = Field(default=None, ge=0)
    lowThresholdMl: float | None = Field(default=None, ge=0)
    updatedAt: str | None = None  # ISO string kept verbatim

    model_config = ConfigDict(extra="forbid")

    def __init__(self, **data):
        """Minimal initializer to satisfy docstring checks for __init__."""
        super().__init__(**data)


class Calibration(BaseModel):
    """Calibration information mapping seconds to millilitres."""

    mlPerSecond: float = Field(gt=0)
    lastCalibratedAt: str  # ISO date string

    model_config = ConfigDict(extra="forbid")

    def __repr__(self) -> str:  # pragma: no cover - helpful repr
        """Return a concise representation for debugging/testing."""
        return f"Calibration(mlPerSecond={self.mlPerSecond})"


class DoserHeadStats(BaseModel):
    """Runtime statistics for a dosing head."""

    dosesToday: int | None = Field(default=None, ge=0)
    mlDispensedToday: float | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")

    def __repr__(self) -> str:  # pragma: no cover - concise repr
        """Return a concise representation for doser head stats."""
        return f"DoserHeadStats(dosesToday={self.dosesToday})"


class SingleSchedule(BaseModel):
    """Single daily dose schedule."""

    mode: Literal["single"]
    dailyDoseMl: float = Field(gt=0)
    startTime: str = TimeString

    model_config = ConfigDict(extra="forbid")

    """Schedule representing a single daily dose at a fixed time."""


class EveryHourSchedule(BaseModel):
    """Schedule dosing every N hours starting at a time."""

    mode: Literal["every_hour"]
    dailyDoseMl: float = Field(gt=0)
    startTime: str = TimeString

    model_config = ConfigDict(extra="forbid")

    """Schedule for dosing every hour starting at a time."""


class CustomPeriod(BaseModel):
    """A single custom period in a custom_periods schedule."""

    startTime: str = TimeString
    endTime: str = TimeString
    doses: int = Field(ge=1)

    model_config = ConfigDict(extra="forbid")

    """A period entry within a custom periods schedule."""


class CustomPeriodsSchedule(BaseModel):
    """Schedule composed of named time periods with dose counts."""

    mode: Literal["custom_periods"]
    dailyDoseMl: float = Field(gt=0)
    periods: list[CustomPeriod]

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_periods(self) -> "CustomPeriodsSchedule":
        """Validate that custom periods are present and sane."""
        if not self.periods:
            raise ValueError(
                "Custom periods schedule requires at least one period"
            )

        total_doses = sum(period.doses for period in self.periods)
        if total_doses > 24:
            raise ValueError(
                "Custom periods schedule cannot exceed 24 doses in total"
            )
        return self


class TimerDose(BaseModel):
    """A single timed dose entry for a timer schedule."""

    time: str = TimeString
    quantityMl: float = Field(gt=0)

    model_config = ConfigDict(extra="forbid")

    """Represents a timed single dose within a timer schedule."""


class TimerSchedule(BaseModel):
    """Timer-based schedule with explicit dose times."""

    mode: Literal["timer"]
    doses: list[TimerDose]
    defaultDoseQuantityMl: float | None = Field(default=None, gt=0)
    dailyDoseMl: float | None = Field(default=None, gt=0)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_doses(self) -> "TimerSchedule":
        """Validate doses list for a timer schedule."""
        if not self.doses:
            raise ValueError("Timer schedule requires at least one dose")
        if len(self.doses) > 24:
            raise ValueError("Timer schedule cannot include more than 24 doses")
        return self


Schedule = Field(discriminator="mode")


class DoserHead(BaseModel):
    """Model for a dosing head (index, schedule, calibration, stats)."""

    index: Literal[1, 2, 3, 4]
    label: str | None = None
    active: bool
    schedule: (
        SingleSchedule
        | EveryHourSchedule
        | CustomPeriodsSchedule
        | TimerSchedule
    ) = Schedule
    recurrence: Recurrence
    missedDoseCompensation: bool
    volumeTracking: VolumeTracking | None = None
    calibration: Calibration
    stats: DoserHeadStats | None = None

    model_config = ConfigDict(extra="forbid")

    """Representation of a dosing head on a device."""


class ConfigurationRevision(BaseModel):
    """A single revision snapshot containing head definitions."""

    revision: int = Field(ge=1)
    savedAt: str
    heads: list[DoserHead]
    note: str | None = None
    savedBy: str | None = None

    model_config = ConfigDict(extra="forbid")

    """A single saved revision of a device configuration."""

    @model_validator(mode="after")
    def validate_heads(self) -> "ConfigurationRevision":
        """Ensure a configuration revision contains valid head entries."""
        if not self.heads:
            raise ValueError(
                "Configuration revision must include at least one head"
            )
        if len(self.heads) > 4:
            raise ValueError(
                "Configuration revision cannot have more than four heads"
            )
        _ensure_unique([str(head.index) for head in self.heads], "head index")
        return self


class DeviceConfiguration(BaseModel):
    """A named device configuration composed of sequential revisions."""

    id: str
    name: str
    revisions: list[ConfigurationRevision]
    createdAt: str
    updatedAt: str
    description: str | None = None

    model_config = ConfigDict(extra="forbid")

    """Named configuration containing an ordered list of revisions."""

    @model_validator(mode="after")
    def validate_revisions(self) -> "DeviceConfiguration":
        """Validate the ordering and uniqueness of configuration revisions."""
        if not self.revisions:
            raise ValueError(
                "Device configuration must include at least one revision"
            )

        self.revisions.sort(key=lambda revision: revision.revision)
        revision_numbers = [revision.revision for revision in self.revisions]
        if len(set(revision_numbers)) != len(revision_numbers):
            raise ValueError("Configuration revisions must be unique")
        if revision_numbers[0] != 1:
            raise ValueError("Configuration revisions must start at 1")
        for previous, current in zip(revision_numbers, revision_numbers[1:]):
            if current != previous + 1:
                raise ValueError(
                    "Configuration revision numbers must increase sequentially"
                )
        return self

    def latest_revision(self) -> ConfigurationRevision:
        """Return the latest revision in this configuration."""
        return self.revisions[-1]


class DoserDevice(BaseModel):
    """Top-level device model for dosing pumps, containing configurations."""

    id: str
    name: str | None = None
    timezone: str
    configurations: list[DeviceConfiguration]
    activeConfigurationId: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None

    model_config = ConfigDict(extra="forbid")

    """Top-level device model for a dosing pump, including configs."""

    @model_validator(mode="before")
    def migrate_legacy_heads(cls, data: object) -> object:
        """Support legacy payloads that provide `heads` at the top level.

        This migrates old payload shapes into the newer `configurations`
        structure when necessary.
        """
        if not isinstance(data, dict):
            return data

        if "configurations" in data and data["configurations"]:
            data.pop("heads", None)
            return data

        heads = data.pop("heads", None)
        if not heads:
            raise ValueError(
                "Legacy doser payload must include heads when configurations are absent"
            )

        timestamp = data.get("updatedAt") or data.get("createdAt") or _now_iso()
        config_id = data.get("activeConfigurationId") or "default"
        configuration = {
            "id": config_id,
            "name": data.get("name") or "Default",
            "createdAt": data.get("createdAt") or timestamp,
            "updatedAt": timestamp,
            "revisions": [
                {
                    "revision": 1,
                    "savedAt": timestamp,
                    "heads": heads,
                }
            ],
        }

        data["configurations"] = [configuration]
        data["activeConfigurationId"] = config_id
        return data

    @model_validator(mode="after")
    def validate_configurations(self) -> "DoserDevice":
        """Validate the device has configurations and an active selection."""
        if not self.configurations:
            raise ValueError(
                "A doser device must have at least one configuration"
            )

        ids = [config.id for config in self.configurations]
        _ensure_unique(ids, "configuration id")

        if self.activeConfigurationId is None:
            self.activeConfigurationId = self.configurations[0].id
        else:
            if self.activeConfigurationId not in ids:
                raise ValueError(
                    "Active configuration id does not match any configuration"
                )
        return self

    def get_configuration(self, configuration_id: str) -> DeviceConfiguration:
        """Return the configuration with the given id or raise KeyError."""
        for configuration in self.configurations:
            if configuration.id == configuration_id:
                return configuration
        raise KeyError(configuration_id)

    def get_active_configuration(self) -> DeviceConfiguration:
        """Return the currently active configuration for this device."""
        if self.activeConfigurationId is None:
            raise ValueError("Device does not have an active configuration set")
        return self.get_configuration(self.activeConfigurationId)


class DoserDeviceCollection(BaseModel):
    """Container for a collection of doser devices (persisted store)."""

    devices: list[DoserDevice] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "DoserDeviceCollection":
        """Ensure device ids are unique within the collection."""
        _ensure_unique([device.id for device in self.devices], "device id")
        return self


class DoserStorage:
    """A lightweight JSON-backed store for dosing pump configurations."""

    def __init__(self, path: Path | str):
        """Initialize the storage backed by the given file path."""
        self._path = Path(path)
        self._collection = self._read()

    def list_devices(self) -> list[DoserDevice]:
        """Return all persisted devices."""
        return list(self._collection.devices)

    def get_device(self, device_id: str) -> DoserDevice | None:
        """Return a device by id or None if not found."""
        return next(
            (
                device
                for device in self._collection.devices
                if device.id == device_id
            ),
            None,
        )

    def upsert_device(self, device: DoserDevice | dict) -> DoserDevice:
        """Insert or update a device and persist the collection."""
        model = self._validate_device(device)
        existing = self.get_device(model.id)
        if existing is None:
            self._collection.devices.append(model)
        else:
            idx = self._collection.devices.index(existing)
            self._collection.devices[idx] = model
        self._write()
        return model

    def upsert_many(
        self, devices: Iterable[DoserDevice | dict]
    ) -> list[DoserDevice]:
        """Replace the entire collection with the provided devices."""
        models = [self._validate_device(device) for device in devices]
        # Replace collection with validated list to ensure consistency
        self._collection = DoserDeviceCollection(devices=models)
        self._write()
        return models

    def delete_device(self, device_id: str) -> bool:
        """Delete a device by id, returning True if removed."""
        for idx, device in enumerate(self._collection.devices):
            if device.id == device_id:
                del self._collection.devices[idx]
                self._write()
                return True
        return False

    def list_configurations(self, device_id: str) -> list[DeviceConfiguration]:
        """List configurations for a given device id."""
        device = self._require_device(device_id)
        return list(device.configurations)

    def get_configuration(
        self, device_id: str, configuration_id: str
    ) -> DeviceConfiguration:
        """Retrieve a specific configuration for a device."""
        device = self._require_device(device_id)
        return device.get_configuration(configuration_id)

    def create_configuration(
        self,
        device_id: str,
        name: str,
        heads: Iterable[DoserHead | dict],
        *,
        description: str | None = None,
        configuration_id: str | None = None,
        saved_by: str | None = None,
        note: str | None = None,
        saved_at: str | None = None,
        set_active: bool = False,
    ) -> DeviceConfiguration:
        """Create and append a new named configuration for a device."""
        device = self._require_device(device_id)

        new_id = configuration_id or str(uuid4())
        if any(
            configuration.id == new_id
            for configuration in device.configurations
        ):
            raise ValueError(
                f"Configuration '{new_id}' already exists for device '{device_id}'"
            )

        timestamp = saved_at or _now_iso()
        revision = ConfigurationRevision(
            revision=1,
            savedAt=timestamp,
            heads=list(heads),
            note=note,
            savedBy=saved_by,
        )
        configuration = DeviceConfiguration(
            id=new_id,
            name=name,
            description=description,
            createdAt=timestamp,
            updatedAt=timestamp,
            revisions=[revision],
        )
        device.configurations.append(configuration)
        device.updatedAt = timestamp
        configuration.updatedAt = timestamp
        if set_active or device.activeConfigurationId is None:
            device.activeConfigurationId = configuration.id
        self._write()
        return configuration

    def add_revision(
        self,
        device_id: str,
        configuration_id: str,
        heads: Iterable[DoserHead | dict],
        *,
        note: str | None = None,
        saved_by: str | None = None,
        saved_at: str | None = None,
        set_active: bool = False,
    ) -> ConfigurationRevision:
        """Append a new revision to an existing configuration."""
        device = self._require_device(device_id)
        configuration = device.get_configuration(configuration_id)

        timestamp = saved_at or _now_iso()
        next_revision_number = configuration.latest_revision().revision + 1
        revision = ConfigurationRevision(
            revision=next_revision_number,
            savedAt=timestamp,
            heads=list(heads),
            note=note,
            savedBy=saved_by,
        )
        configuration.revisions.append(revision)
        configuration.updatedAt = timestamp
        device.updatedAt = timestamp
        if set_active:
            device.activeConfigurationId = configuration.id
        self._write()
        return revision

    def set_active_configuration(
        self, device_id: str, configuration_id: str
    ) -> DeviceConfiguration:
        """Set the active configuration id on a device and persist."""
        device = self._require_device(device_id)
        configuration = device.get_configuration(configuration_id)
        device.activeConfigurationId = configuration.id
        device.updatedAt = _now_iso()
        self._write()
        return configuration

    # Internal helpers -------------------------------------------------
    def _validate_device(self, device: DoserDevice | dict) -> DoserDevice:
        """Validate or coerce an input into a DoserDevice model."""
        if isinstance(device, DoserDevice):
            return device
        return DoserDevice.model_validate(device)

    def _require_device(self, device_id: str) -> DoserDevice:
        """Return a device by id or raise KeyError if missing."""
        device = self.get_device(device_id)
        if device is None:
            raise KeyError(device_id)
        return device

    def _read(self) -> DoserDeviceCollection:
        """Read and parse the storage file into a DoserDeviceCollection."""
        if not self._path.exists():
            return DoserDeviceCollection()

        raw = self._path.read_text(encoding="utf-8").strip()
        if not raw:
            return DoserDeviceCollection()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Could not parse doser storage JSON: {exc}"
            ) from exc

        return DoserDeviceCollection.model_validate(data)

    def _write(self) -> None:
        """Write the current collection state atomically to the storage file."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = self._collection.model_dump(mode="json")
        tmp_path = self._path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8"
        )
        tmp_path.replace(self._path)


__all__ = [
    "Calibration",
    "ConfigurationRevision",
    "CustomPeriod",
    "CustomPeriodsSchedule",
    "DeviceConfiguration",
    "DoserDevice",
    "DoserDeviceCollection",
    "DoserHead",
    "DoserHeadStats",
    "DoserStorage",
    "EveryHourSchedule",
    "ModeKind",
    "Recurrence",
    "SingleSchedule",
    "TimerDose",
    "TimerSchedule",
    "VolumeTracking",
    "Weekday",
]
