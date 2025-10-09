"""Unit tests for the doser storage module."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from aquarium_device_manager.doser_storage import DoserStorage


@pytest.fixture
def storage_path(tmp_path: Path) -> Path:
    """Provide a temporary path for doser storage tests."""
    return tmp_path / "doser_storage_dir"


def _example_device(device_id: str = "device-1") -> dict:
    """Return an example doser device payload for tests."""
    heads = [
        {
            "index": 1,
            "label": "Macro",
            "active": True,
            "schedule": {
                "mode": "single",
                "dailyDoseMl": 6.5,
                "startTime": "08:30",
            },
            "recurrence": {"days": ["Mon", "Wed", "Fri"]},
            "missedDoseCompensation": True,
            "volumeTracking": {
                "enabled": True,
                "capacityMl": 500.0,
                "currentMl": 320.0,
                "lowThresholdMl": 50.0,
            },
            "calibration": {
                "mlPerSecond": 1.8,
                "lastCalibratedAt": "2024-09-10",
            },
            "stats": {"dosesToday": 1, "mlDispensedToday": 2.2},
        },
        {
            "index": 2,
            "label": "Micro",
            "active": True,
            "schedule": {
                "mode": "timer",
                "doses": [
                    {"time": "09:00", "quantityMl": 1.0},
                    {"time": "18:00", "quantityMl": 1.3},
                ],
                "dailyDoseMl": 2.3,
            },
            "recurrence": {"days": ["Tue", "Thu", "Sat"]},
            "missedDoseCompensation": False,
            "calibration": {
                "mlPerSecond": 1.6,
                "lastCalibratedAt": "2024-09-12",
            },
        },
    ]

    return {
        "id": device_id,
        "name": "Main Doser",
        "timezone": "Australia/Sydney",
        "activeConfigurationId": "config-default",
        "configurations": [
            {
                "id": "config-default",
                "name": "Default weekday dosing",
                "createdAt": "2024-09-01T03:00:00Z",
                "updatedAt": "2024-09-15T11:45:00Z",
                "revisions": [
                    {
                        "revision": 1,
                        "savedAt": "2024-09-15T11:45:00Z",
                        "heads": heads,
                    }
                ],
            }
        ],
        "createdAt": "2024-09-01T03:00:00Z",
        "updatedAt": "2024-09-15T11:45:00Z",
    }


def _legacy_device_payload(device_id: str = "device-legacy") -> dict:
    device = _example_device(device_id)
    heads = deepcopy(device["configurations"][0]["revisions"][0]["heads"])

    return {
        "id": device_id,
        "name": device["name"],
        "timezone": device["timezone"],
        "heads": heads,
        "createdAt": device["createdAt"],
        "updatedAt": device["updatedAt"],
    }


def test_storage_roundtrip(storage_path: Path) -> None:
    """Verify storage write/read roundtrip and active configuration."""
    storage = DoserStorage(storage_path)
    stored = storage.upsert_device(_example_device())

    assert stored.id == "device-1"
    assert storage_path.exists()

    reloaded = DoserStorage(storage_path).get_device("device-1")
    assert reloaded is not None
    assert reloaded.activeConfigurationId == "config-default"
    active_config = reloaded.get_active_configuration()
    assert active_config.id == "config-default"
    assert active_config.latest_revision().heads[0].index == 1
    assert reloaded.model_dump(mode="json") == stored.model_dump(mode="json")

    # File contents should be valid JSON with the expected fields
    device_file_path = storage_path / "device-1.json"
    file_payload = json.loads(device_file_path.read_text(encoding="utf-8"))
    # The file format has metadata wrapper
    assert file_payload["device_type"] == "doser"
    assert file_payload["device_id"] == "device-1"
    device_data = file_payload["device_data"]
    assert device_data["id"] == "device-1"
    assert (
        device_data["configurations"][0]["revisions"][0]["heads"][0]["index"]
        == 1
    )


def test_head_limit_enforced(storage_path: Path) -> None:
    """Ensure validation rejects more than four heads or duplicate indexes."""
    device = _legacy_device_payload()
    device["heads"] = [
        {**device["heads"][0], "index": 1},
        {**device["heads"][0], "index": 2},
        {**device["heads"][0], "index": 3},
        {**device["heads"][0], "index": 4},
        {**device["heads"][0], "index": 4},
    ]

    storage = DoserStorage(storage_path)
    with pytest.raises(ValidationError):
        storage.upsert_device(device)


def test_custom_periods_total_doses_capped(storage_path: Path) -> None:
    """Custom periods schedules cannot exceed 24 total doses."""
    device = _legacy_device_payload()
    device["heads"][0]["schedule"] = {
        "mode": "custom_periods",
        "dailyDoseMl": 12,
        "periods": [
            {"startTime": "06:00", "endTime": "12:00", "doses": 12},
            {"startTime": "12:00", "endTime": "18:00", "doses": 13},
        ],
    }

    storage = DoserStorage(storage_path)
    with pytest.raises(ValidationError):
        storage.upsert_device(device)
