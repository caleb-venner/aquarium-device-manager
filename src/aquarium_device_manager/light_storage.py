"""Persistent storage models and helpers for Chihiros light devices.

This module mirrors the structure defined in ``tests/light_structure.ts`` so that
light device profiles can be validated and persisted exactly as the frontend
expects them.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Literal, Mapping, Sequence
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

Weekday = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
InterpolationKind = Literal["step", "linear"]
TimeString = Field(pattern=r"^\d{2}:\d{2}$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _time_to_minutes(value: str) -> int:
    hours, minutes = value.split(":", maxsplit=1)
    return int(hours) * 60 + int(minutes)


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


class ChannelDef(BaseModel):
    """Definition of a color/level channel exposed by a light device."""

    key: str
    label: str | None = None
    min: int = 0
    max: int = 100
    step: int = 1

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_bounds(self) -> "ChannelDef":
        """Validate channel bounds and presence of key."""
        if not self.key:
            raise ValueError("Channel key cannot be empty")
        if self.max < self.min:
            raise ValueError("Channel max must be greater than or equal to min")
        if self.step <= 0:
            raise ValueError("Channel step must be a positive integer")
        return self


ChannelLevels = Mapping[str, int]


class ManualProfile(BaseModel):
    """Profile for manual fixed channel levels."""

    mode: Literal["manual"]
    levels: dict[str, int]

    model_config = ConfigDict(extra="forbid")

    """Manual mode profile specifying fixed channel levels."""

    def __init__(self, **data):
        """Initialize a manual profile."""
        super().__init__(**data)


class CustomPoint(BaseModel):
    """A timed level point within a custom profile."""

    time: str = TimeString
    levels: dict[str, int]

    model_config = ConfigDict(extra="forbid")

    """A single point in a custom profile (time + levels)."""


class CustomProfile(BaseModel):
    """Custom profile made of time-indexed points and interpolation."""

    mode: Literal["custom"]
    interpolation: InterpolationKind
    points: list[CustomPoint]

    model_config = ConfigDict(extra="forbid")

    """Custom time-based profile with interpolation between points."""

    @model_validator(mode="after")
    def validate_points(self) -> "CustomProfile":
        """Validate custom profile points ordering and uniqueness."""
        if not self.points:
            raise ValueError("Custom profile requires at least one point")
        if len(self.points) > 24:
            raise ValueError(
                "Custom profile cannot contain more than 24 points"
            )

        times = [_time_to_minutes(point.time) for point in self.points]
        if times != sorted(times):
            raise ValueError(
                "Custom profile point times must be strictly increasing"
            )
        if len(set(times)) != len(times):
            raise ValueError("Custom profile point times must be unique")
        return self


class AutoProgram(BaseModel):
    """Auto program describing sunrise/sunset transitions for days."""

    id: str
    label: str | None = None
    enabled: bool
    days: list[Weekday]
    sunrise: str = TimeString
    sunset: str = TimeString
    rampMinutes: int
    levels: dict[str, int]

    model_config = ConfigDict(extra="forbid")

    """An auto program that defines sunrise/sunset transitions for days."""

    @model_validator(mode="after")
    def validate_program(self) -> "AutoProgram":
        """Validate auto program fields (days, times, ramp)."""
        if not self.id:
            raise ValueError("Auto program id cannot be empty")
        if not self.days:
            raise ValueError("Auto program must include at least one day")
        _ensure_unique(self.days, "day")
        if _time_to_minutes(self.sunset) <= _time_to_minutes(self.sunrise):
            raise ValueError("Sunset must be after sunrise")
        if self.rampMinutes < 0:
            raise ValueError("Ramp minutes must be non-negative")
        return self


class AutoProfile(BaseModel):
    """Auto profile containing multiple AutoProgram entries."""

    mode: Literal["auto"]
    programs: list[AutoProgram]

    model_config = ConfigDict(extra="forbid")

    """Auto profile containing multiple auto programs."""

    @model_validator(mode="after")
    def validate_programs(self) -> "AutoProfile":
        """Validate the collection of auto programs for limits and uniqueness."""
        if len(self.programs) > 7:
            raise ValueError("Auto profile cannot include more than 7 programs")
        return self


ProfileField = Field(discriminator="mode")


class LightProfileRevision(BaseModel):
    """A revision of a light device profile."""

    revision: int = Field(ge=1)
    savedAt: str
    profile: ManualProfile | CustomProfile | AutoProfile = ProfileField
    note: str | None = None
    savedBy: str | None = None

    model_config = ConfigDict(extra="forbid")

    def __init__(self, **data):
        """Initialize a profile revision."""
        super().__init__(**data)


class _ProfileWrapper(BaseModel):
    """Internal wrapper used to coerce profile dicts into models."""

    profile: ManualProfile | CustomProfile | AutoProfile = ProfileField

    model_config = ConfigDict(extra="forbid")


class LightConfiguration(BaseModel):
    """A named configuration containing profile revisions for a light."""

    id: str
    name: str
    revisions: list[LightProfileRevision]
    createdAt: str
    updatedAt: str
    description: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_revisions(self) -> "LightConfiguration":
        """Validate revisions: ensure ordering, uniqueness and sequential numbering."""
        if not self.revisions:
            raise ValueError("Configuration must include at least one revision")

        self.revisions.sort(key=lambda revision: revision.revision)
        numbers = [revision.revision for revision in self.revisions]
        if len(set(numbers)) != len(numbers):
            raise ValueError("Configuration revision numbers must be unique")
        if numbers[0] != 1:
            raise ValueError("Configuration revisions must start at 1")
        for previous, current in zip(numbers, numbers[1:]):
            if current != previous + 1:
                raise ValueError(
                    "Configuration revisions must increase sequentially"
                )
        return self

    def latest_revision(self) -> LightProfileRevision:
        """Return the most recent profile revision for this configuration."""
        return self.revisions[-1]


class LightDevice(BaseModel):
    """Top-level light device model including channels and configurations."""

    id: str
    name: str | None = None
    timezone: str
    channels: list[ChannelDef]
    configurations: list[LightConfiguration]
    activeConfigurationId: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_device(self) -> "LightDevice":
        """Validate device-level invariants such as channels and configurations."""
        if not self.channels:
            raise ValueError("Light device must define at least one channel")

        channel_keys = [channel.key for channel in self.channels]
        _ensure_unique(channel_keys, "channel key")
        channel_map = {channel.key: channel for channel in self.channels}

        if not self.configurations:
            raise ValueError(
                "Light device must have at least one configuration"
            )

        configuration_ids = [
            configuration.id for configuration in self.configurations
        ]
        _ensure_unique(configuration_ids, "configuration id")

        for configuration in self.configurations:
            for revision in configuration.revisions:
                _validate_profile_for_channels(revision.profile, channel_map)

        if self.activeConfigurationId is None:
            self.activeConfigurationId = self.configurations[0].id
        else:
            if self.activeConfigurationId not in configuration_ids:
                raise ValueError(
                    "Active configuration id does not match any configuration"
                )
        return self

    def get_configuration(self, configuration_id: str) -> LightConfiguration:
        """Return a specific configuration by id or raise KeyError if missing."""
        for configuration in self.configurations:
            if configuration.id == configuration_id:
                return configuration
        raise KeyError(configuration_id)

    def get_active_configuration(self) -> LightConfiguration:
        """Return the currently active configuration for the device."""
        if self.activeConfigurationId is None:
            raise ValueError("Device does not have an active configuration set")
        return self.get_configuration(self.activeConfigurationId)


class LightDeviceCollection(BaseModel):
    """A collection container for persisted light devices."""

    devices: list[LightDevice] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "LightDeviceCollection":
        """Ensure all devices within a collection have unique ids."""
        _ensure_unique([device.id for device in self.devices], "device id")
        return self


def _validate_levels_for_channels(
    levels: Mapping[str, int], channel_map: Mapping[str, ChannelDef]
) -> None:
    expected_keys = set(channel_map)
    provided_keys = set(levels)
    missing = expected_keys - provided_keys
    if missing:
        raise ValueError(f"Missing levels for channels: {sorted(missing)}")
    extra = provided_keys - expected_keys
    if extra:
        raise ValueError(f"Unexpected channel levels provided: {sorted(extra)}")

    for key, value in levels.items():
        definition = channel_map[key]
        min_value = definition.min
        max_value = definition.max
        if value < min_value or value > max_value:
            raise ValueError(
                "Channel '{}' level {} outside of range {}-{}".format(
                    key, value, min_value, max_value
                )
            )
        step = definition.step
        if (value - min_value) % step != 0:
            raise ValueError(
                "Channel '{}' level {} must align with step {} from {}".format(
                    key, value, step, min_value
                )
            )


def _validate_profile_for_channels(
    profile: ManualProfile | CustomProfile | AutoProfile,
    channel_map: Mapping[str, ChannelDef],
) -> None:
    if profile.mode == "manual":
        _validate_levels_for_channels(profile.levels, channel_map)
    elif profile.mode == "custom":
        for point in profile.points:
            _validate_levels_for_channels(point.levels, channel_map)
    elif profile.mode == "auto":
        for program in profile.programs:
            _validate_levels_for_channels(program.levels, channel_map)
    else:  # pragma: no cover - safeguarded by discriminator
        raise ValueError(f"Unsupported profile mode: {profile.mode}")


class LightStorage:
    """A lightweight JSON-backed store for light device profiles."""

    def __init__(self, path: Path | str):
        """Initialize storage and load existing collection from disk if present."""
        self._path = Path(path)
        self._collection = self._read()

    def list_devices(self) -> list[LightDevice]:
        """Return all persisted light devices."""
        return list(self._collection.devices)

    def get_device(self, device_id: str) -> LightDevice | None:
        """Return a light device by id or None if not found."""
        return next(
            (
                device
                for device in self._collection.devices
                if device.id == device_id
            ),
            None,
        )

    def upsert_device(self, device: LightDevice | dict) -> LightDevice:
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
        self, devices: Iterable[LightDevice | dict]
    ) -> list[LightDevice]:
        """Replace the entire device collection with the provided devices."""
        models = [self._validate_device(device) for device in devices]
        self._collection = LightDeviceCollection(devices=models)
        self._write()
        return models

    def delete_device(self, device_id: str) -> bool:
        """Remove a device by id from the collection, returning True if removed."""
        for idx, device in enumerate(self._collection.devices):
            if device.id == device_id:
                del self._collection.devices[idx]
                self._write()
                return True
        return False

    def list_configurations(self, device_id: str) -> list[LightConfiguration]:
        """List configurations for the given device id."""
        device = self._require_device(device_id)
        return list(device.configurations)

    def get_configuration(
        self, device_id: str, configuration_id: str
    ) -> LightConfiguration:
        """Return the configuration for a device by configuration id."""
        device = self._require_device(device_id)
        return device.get_configuration(configuration_id)

    def create_configuration(
        self,
        device_id: str,
        name: str,
        profile: ManualProfile | CustomProfile | AutoProfile | dict,
        *,
        description: str | None = None,
        configuration_id: str | None = None,
        saved_by: str | None = None,
        note: str | None = None,
        saved_at: str | None = None,
        set_active: bool = False,
    ) -> LightConfiguration:
        """Create a new configuration for a device and persist it."""
        device = self._require_device(device_id)
        channel_map = {channel.key: channel for channel in device.channels}

        new_id = configuration_id or str(uuid4())
        if any(
            configuration.id == new_id
            for configuration in device.configurations
        ):
            raise ValueError(
                f"Configuration '{new_id}' already exists for device '{device_id}'"
            )

        timestamp = saved_at or _now_iso()
        profile_model = self._validate_profile(profile)
        _validate_profile_for_channels(profile_model, channel_map)

        revision = LightProfileRevision(
            revision=1,
            savedAt=timestamp,
            profile=profile_model,
            note=note,
            savedBy=saved_by,
        )
        configuration = LightConfiguration(
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
        profile: ManualProfile | CustomProfile | AutoProfile | dict,
        *,
        note: str | None = None,
        saved_by: str | None = None,
        saved_at: str | None = None,
        set_active: bool = False,
    ) -> LightProfileRevision:
        """Add a new profile revision to an existing device configuration."""
        device = self._require_device(device_id)
        configuration = device.get_configuration(configuration_id)
        channel_map = {channel.key: channel for channel in device.channels}

        timestamp = saved_at or _now_iso()
        profile_model = self._validate_profile(profile)
        _validate_profile_for_channels(profile_model, channel_map)

        next_revision_number = configuration.latest_revision().revision + 1
        revision = LightProfileRevision(
            revision=next_revision_number,
            savedAt=timestamp,
            profile=profile_model,
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
    ) -> LightConfiguration:
        """Mark a configuration as active for the given device and persist."""
        device = self._require_device(device_id)
        configuration = device.get_configuration(configuration_id)
        device.activeConfigurationId = configuration.id
        device.updatedAt = _now_iso()
        self._write()
        return configuration

    def _validate_device(self, device: LightDevice | dict) -> LightDevice:
        if isinstance(device, LightDevice):
            return device
        return LightDevice.model_validate(device)

    def _validate_profile(
        self, profile: ManualProfile | CustomProfile | AutoProfile | dict
    ) -> ManualProfile | CustomProfile | AutoProfile:
        if isinstance(profile, (ManualProfile, CustomProfile, AutoProfile)):
            return profile
        return _ProfileWrapper.model_validate({"profile": profile}).profile

    def _require_device(self, device_id: str) -> LightDevice:
        device = self.get_device(device_id)
        if device is None:
            raise KeyError(device_id)
        return device

    def _read(self) -> LightDeviceCollection:
        if not self._path.exists():
            return LightDeviceCollection()

        raw = self._path.read_text(encoding="utf-8").strip()
        if not raw:
            return LightDeviceCollection()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Could not parse light storage JSON: {exc}"
            ) from exc

        return LightDeviceCollection.model_validate(data)

    def _write(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = self._collection.model_dump(mode="json")
        tmp_path = self._path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8"
        )
        tmp_path.replace(self._path)


__all__ = [
    "AutoProfile",
    "AutoProgram",
    "ChannelDef",
    "CustomPoint",
    "CustomProfile",
    "InterpolationKind",
    "LightConfiguration",
    "LightDevice",
    "LightDeviceCollection",
    "LightProfileRevision",
    "LightStorage",
    "ManualProfile",
    "Weekday",
]
