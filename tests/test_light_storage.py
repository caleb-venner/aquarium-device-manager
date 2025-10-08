"""Unit tests for the light storage persistence layer."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from aquarium_device_manager.light_storage import LightStorage


@pytest.fixture
def storage_path(tmp_path: Path) -> Path:
    """Provide a temporary path for light storage tests."""
    return tmp_path / "lights.json"


def _channels() -> list[dict]:
    """Return a sample list of channel definitions for tests."""
    return [
        {"key": "R", "label": "Red", "min": 0, "max": 100, "step": 5},
        {"key": "G", "label": "Green", "min": 10, "max": 90, "step": 10},
        {"key": "B", "label": "Blue", "min": 0, "max": 80, "step": 5},
    ]


def _manual_levels() -> dict[str, int]:
    return {"R": 50, "G": 50, "B": 40}


def _example_device(device_id: str = "light-1") -> dict:
    timestamp = "2024-09-15T11:45:00Z"
    return {
        "id": device_id,
        "name": "Display Light",
        "timezone": "Australia/Sydney",
        "channels": _channels(),
        "activeConfigurationId": "config-default",
        "configurations": [
            {
                "id": "config-default",
                "name": "Manual daytime",
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "revisions": [
                    {
                        "revision": 1,
                        "savedAt": timestamp,
                        "profile": {
                            "mode": "manual",
                            "levels": _manual_levels(),
                        },
                    }
                ],
            }
        ],
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def test_storage_roundtrip(storage_path: Path) -> None:
    """Verify light storage roundtrip and profile persistence."""
    storage = LightStorage(storage_path)
    stored = storage.upsert_device(_example_device())

    assert stored.id == "light-1"
    assert storage_path.exists()

    reloaded = LightStorage(storage_path).get_device("light-1")
    assert reloaded is not None
    active = reloaded.get_active_configuration()
    assert active.latest_revision().profile.mode == "manual"
    assert active.latest_revision().profile.levels == _manual_levels()
    assert reloaded.model_dump(mode="json") == stored.model_dump(mode="json")

    raw = json.loads(storage_path.read_text(encoding="utf-8"))
    assert raw["devices"][0]["id"] == "light-1"


def test_manual_profile_must_cover_all_channels(storage_path: Path) -> None:
    """Manual profile must include entries for every channel."""
    device = _example_device()
    device["configurations"][0]["revisions"][0]["profile"]["levels"].pop("G")

    storage = LightStorage(storage_path)
    with pytest.raises(ValidationError):
        storage.upsert_device(device)


def test_custom_profile_requires_increasing_times(storage_path: Path) -> None:
    """Custom profile points must be strictly increasing in time."""
    device = _example_device()
    device["configurations"][0]["revisions"][0]["profile"] = {
        "mode": "custom",
        "interpolation": "linear",
        "points": [
            {"time": "10:00", "levels": _manual_levels()},
            {"time": "09:30", "levels": _manual_levels()},
        ],
    }

    storage = LightStorage(storage_path)
    with pytest.raises(ValidationError):
        storage.upsert_device(device)


def test_auto_profile_validates_days_and_sun_times(storage_path: Path) -> None:
    """Auto programs must include valid days and sunrise < sunset."""
    device = _example_device()
    device["configurations"][0]["revisions"][0]["profile"] = {
        "mode": "auto",
        "programs": [
            {
                "id": "prog-1",
                "enabled": True,
                "days": ["Mon", "Mon"],
                "sunrise": "08:00",
                "sunset": "07:00",
                "rampMinutes": 30,
                "levels": _manual_levels(),
            }
        ],
    }

    storage = LightStorage(storage_path)
    with pytest.raises(ValidationError):
        storage.upsert_device(device)


def test_create_configuration_adds_revision(storage_path: Path) -> None:
    """Creating a new configuration adds a first revision and can set active."""
    storage = LightStorage(storage_path)
    storage.upsert_device(_example_device())

    custom_profile = {
        "mode": "custom",
        "interpolation": "step",
        "points": [
            {"time": "08:00", "levels": _manual_levels()},
            {"time": "12:00", "levels": {"R": 60, "G": 70, "B": 40}},
            {"time": "18:00", "levels": _manual_levels()},
        ],
    }

    created = storage.create_configuration(
        "light-1",
        name="Day cycle",
        profile=custom_profile,
        description="Step transitions",
        set_active=True,
    )

    device = storage.get_device("light-1")
    assert device is not None
    assert created.id in {config.id for config in device.configurations}
    assert device.activeConfigurationId == created.id
    assert created.latest_revision().revision == 1
    assert created.latest_revision().profile.mode == "custom"


def test_add_revision_increments_revision(storage_path: Path) -> None:
    """Adding a revision increments the revision counter and can set active."""
    storage = LightStorage(storage_path)
    storage.upsert_device(_example_device())

    manual_update = deepcopy(_manual_levels())
    manual_update["R"] = 55
    manual_update["G"] = 60

    revision = storage.add_revision(
        "light-1",
        "config-default",
        profile={"mode": "manual", "levels": manual_update},
        note="Evening tweak",
        set_active=True,
    )

    assert revision.revision == 2
    device = storage.get_device("light-1")
    assert device is not None
    active = device.get_active_configuration()
    assert active.latest_revision().revision == 2
    assert active.latest_revision().profile.levels == manual_update


def test_set_active_configuration_switches(storage_path: Path) -> None:
    """Setting active configuration updates device.activeConfigurationId."""
    storage = LightStorage(storage_path)
    storage.upsert_device(_example_device())

    auto_profile = {
        "mode": "auto",
        "programs": [
            {
                "id": "weekday",
                "enabled": True,
                "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "sunrise": "07:30",
                "sunset": "20:00",
                "rampMinutes": 45,
                "levels": _manual_levels(),
            }
        ],
    }

    auto_config = storage.create_configuration(
        "light-1", name="Weekday Auto", profile=auto_profile
    )
    storage.set_active_configuration("light-1", auto_config.id)

    device = storage.get_device("light-1")
    assert device is not None
    assert device.activeConfigurationId == auto_config.id
