"""Test configuration storage integration with BLE service."""

from unittest.mock import patch

import pytest

from aquarium_device_manager.ble_service import BLEService
from aquarium_device_manager.doser_storage import DoserStorage


@pytest.fixture
def temp_config_dir(tmp_path):
    """Create temporary configuration directory."""
    config_dir = tmp_path / ".chihiros"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


@pytest.fixture
def doser_storage(temp_config_dir):
    """Create doser storage instance with temp path."""
    return DoserStorage(temp_config_dir / "doser_configs.json")


@pytest.fixture
def mock_ble_service(doser_storage, temp_config_dir):
    """Create a mocked BLE service with real storage."""
    with patch(
        "aquarium_device_manager.ble_service.CONFIG_DIR", temp_config_dir
    ):
        with patch(
            "aquarium_device_manager.ble_service.DOSER_CONFIG_PATH",
            temp_config_dir / "doser_configs.json",
        ):
            service = BLEService()
            service._doser_storage = doser_storage
            return service


def test_doser_storage_initialized_on_service_creation(mock_ble_service):
    """Test that storage is initialized when service is created."""
    assert mock_ble_service._doser_storage is not None
    assert mock_ble_service._light_storage is not None
    assert mock_ble_service._auto_save_config is True


def test_config_helpers_create_default():
    """Test creating default doser configuration."""
    from aquarium_device_manager.config_helpers import (
        create_default_doser_config,
    )

    address = "11:22:33:44:55:66"
    device = create_default_doser_config(address, name="Test Doser")

    assert device.id == address
    assert device.name == "Test Doser"
    assert len(device.configurations) == 1

    config = device.get_active_configuration()
    assert config.id == "default"
    assert len(config.revisions) == 1

    revision = config.latest_revision()
    assert len(revision.heads) == 4

    # Verify all heads are inactive by default
    for head in revision.heads:
        assert head.active is False
        assert head.schedule.mode == "single"


def test_config_helpers_update_schedule():
    """Test updating schedule in configuration."""
    from aquarium_device_manager.config_helpers import (
        create_default_doser_config,
        update_doser_schedule_config,
    )

    device = create_default_doser_config("AA:BB:CC:DD:EE:FF")

    # Update head 2's schedule
    args = {
        "head_index": 2,
        "volume_tenths_ml": 75,  # 7.5 ml
        "hour": 8,
        "minute": 15,
        "weekdays": ["Tue", "Thu", "Sat"],
    }

    updated = update_doser_schedule_config(device, args)

    config = updated.get_active_configuration()
    head = next(h for h in config.latest_revision().heads if h.index == 2)

    assert head.active is True
    assert head.schedule.dailyDoseMl == 7.5
    assert head.schedule.startTime == "08:15"
    assert head.recurrence.days == ["Tue", "Thu", "Sat"]
