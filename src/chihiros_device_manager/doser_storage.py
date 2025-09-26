"""Persistent storage models and helpers for Chihiros dosing pumps.

This module mirrors the structure defined in ``doser_structure.ts`` so that the
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
    duplicates = {value for value in values if values.count(value) > 1}
    if duplicates:
        plural = "s" if len(duplicates) > 1 else ""
        raise ValueError(f"Duplicate {what}{plural}: {sorted(duplicates)}")


class Recurrence(BaseModel):
    days: list[Weekday]

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_days(self) -> "Recurrence":
        if not self.days:
            raise ValueError("Recurrence must include at least one day")
        _ensure_unique(self.days, "weekday")
        return self


class VolumeTracking(BaseModel):
    enabled: bool
    capacityMl: float | None = Field(default=None, ge=0)
    currentMl: float | None = Field(default=None, ge=0)
    lowThresholdMl: float | None = Field(default=None, ge=0)
    updatedAt: str | None = None  # ISO string kept verbatim

    model_config = ConfigDict(extra="forbid")


class Calibration(BaseModel):
    mlPerSecond: float = Field(gt=0)
    lastCalibratedAt: str  # ISO date string

    model_config = ConfigDict(extra="forbid")


class DoserHeadStats(BaseModel):
    dosesToday: int | None = Field(default=None, ge=0)
    mlDispensedToday: float | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")


class SingleSchedule(BaseModel):
    mode: Literal["single"]
    dailyDoseMl: float = Field(gt=0)
    startTime: str = TimeString

    model_config = ConfigDict(extra="forbid")


class EveryHourSchedule(BaseModel):
    mode: Literal["every_hour"]
    dailyDoseMl: float = Field(gt=0)
    startTime: str = TimeString

    model_config = ConfigDict(extra="forbid")


class CustomPeriod(BaseModel):
    startTime: str = TimeString
    endTime: str = TimeString
    doses: int = Field(ge=1)

    model_config = ConfigDict(extra="forbid")


class CustomPeriodsSchedule(BaseModel):
    mode: Literal["custom_periods"]
    dailyDoseMl: float = Field(gt=0)
    periods: list[CustomPeriod]

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_periods(self) -> "CustomPeriodsSchedule":
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
    time: str = TimeString
    quantityMl: float = Field(gt=0)

    model_config = ConfigDict(extra="forbid")


class TimerSchedule(BaseModel):
    mode: Literal["timer"]
    doses: list[TimerDose]
    defaultDoseQuantityMl: float | None = Field(default=None, gt=0)
    dailyDoseMl: float | None = Field(default=None, gt=0)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_doses(self) -> "TimerSchedule":
        if not self.doses:
            raise ValueError("Timer schedule requires at least one dose")
        if len(self.doses) > 24:
            raise ValueError("Timer schedule cannot include more than 24 doses")
        return self


Schedule = Field(discriminator="mode")


class DoserHead(BaseModel):
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


class ConfigurationRevision(BaseModel):
    revision: int = Field(ge=1)
    savedAt: str
    heads: list[DoserHead]
    note: str | None = None
    savedBy: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_heads(self) -> "ConfigurationRevision":
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
    id: str
    name: str
    revisions: list[ConfigurationRevision]
    createdAt: str
    updatedAt: str
    description: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_revisions(self) -> "DeviceConfiguration":
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
        return self.revisions[-1]


class DoserDevice(BaseModel):
    id: str
    name: str | None = None
    timezone: str
    configurations: list[DeviceConfiguration]
    activeConfigurationId: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    def migrate_legacy_heads(cls, data: object) -> object:
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
        for configuration in self.configurations:
            if configuration.id == configuration_id:
                return configuration
        raise KeyError(configuration_id)

    def get_active_configuration(self) -> DeviceConfiguration:
        if self.activeConfigurationId is None:
            raise ValueError("Device does not have an active configuration set")
        return self.get_configuration(self.activeConfigurationId)


class DoserDeviceCollection(BaseModel):
    devices: list[DoserDevice] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "DoserDeviceCollection":
        _ensure_unique([device.id for device in self.devices], "device id")
        return self


class DoserStorage:
    """A lightweight JSON-backed store for dosing pump configurations."""

    def __init__(self, path: Path | str):
        self._path = Path(path)
        self._collection = self._read()

    def list_devices(self) -> list[DoserDevice]:
        """Return all persisted devices."""
        return list(self._collection.devices)

    def get_device(self, device_id: str) -> DoserDevice | None:
        return next(
            (
                device
                for device in self._collection.devices
                if device.id == device_id
            ),
            None,
        )

    def upsert_device(self, device: DoserDevice | dict) -> DoserDevice:
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
        models = [self._validate_device(device) for device in devices]
        # Replace collection with validated list to ensure consistency
        self._collection = DoserDeviceCollection(devices=models)
        self._write()
        return models

    def delete_device(self, device_id: str) -> bool:
        for idx, device in enumerate(self._collection.devices):
            if device.id == device_id:
                del self._collection.devices[idx]
                self._write()
                return True
        return False

    def list_configurations(self, device_id: str) -> list[DeviceConfiguration]:
        device = self._require_device(device_id)
        return list(device.configurations)

    def get_configuration(
        self, device_id: str, configuration_id: str
    ) -> DeviceConfiguration:
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
        device = self._require_device(device_id)
        configuration = device.get_configuration(configuration_id)
        device.activeConfigurationId = configuration.id
        device.updatedAt = _now_iso()
        self._write()
        return configuration

    # Internal helpers -------------------------------------------------
    def _validate_device(self, device: DoserDevice | dict) -> DoserDevice:
        if isinstance(device, DoserDevice):
            return device
        return DoserDevice.model_validate(device)

    def _require_device(self, device_id: str) -> DoserDevice:
        device = self.get_device(device_id)
        if device is None:
            raise KeyError(device_id)
        return device

    def _read(self) -> DoserDeviceCollection:
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
