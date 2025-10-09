"""Tests for the CommandExecutor and configuration saving logic."""

import asyncio
from datetime import time
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from aquarium_device_manager.ble_service import BLEService, CachedStatus
from aquarium_device_manager.command_executor import CommandExecutor
from aquarium_device_manager.commands.encoder import LightWeekday, PumpWeekday
from aquarium_device_manager.commands_model import CommandRequest
from aquarium_device_manager.config_helpers import (
    create_default_doser_config,
    create_default_light_profile,
)

# All test coroutines will be treated as marked.
pytestmark = pytest.mark.asyncio


@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def ble_service(tmp_path: Path) -> BLEService:
    """Fixture for a BLEService instance with temporary storage."""
    with patch("aquarium_device_manager.ble_service.CONFIG_DIR", tmp_path):
        service = BLEService()
        # Disable auto-saving at the service level for more controlled testing
        service._auto_save_config = True
        return service


@pytest.fixture
def command_executor(ble_service: BLEService) -> CommandExecutor:
    """Fixture for a CommandExecutor instance."""
    return CommandExecutor(ble_service)


async def test_execute_set_doser_schedule_success(
    command_executor: CommandExecutor, ble_service: BLEService, tmp_path: Path
):
    """Verify set_schedule command execution and config persistence for dosers."""
    address = "AA:BB:CC:DD:EE:FF"
    device_config = create_default_doser_config(address)
    ble_service._doser_storage.upsert_device(device_config)

    # Mock the BLE command method
    mock_status = CachedStatus(
        address=address,
        device_type="doser",
        raw_payload=None,
        parsed={},
        updated_at=0,
    )
    ble_service.set_doser_schedule = AsyncMock(return_value=mock_status)

    # Define the command request
    request = CommandRequest(
        action="set_schedule",
        args={
            "head_index": 1,  # Use 1-based indexing to match default config
            "volume_tenths_ml": 55,  # 5.5ml
            "hour": 10,
            "minute": 30,
            "weekdays": [
                PumpWeekday.monday,
                PumpWeekday.wednesday,
                PumpWeekday.friday,
            ],
        },
    )

    # Execute the command
    record = await command_executor.execute_command(address, request)

    # --- Assertions ---
    # 1. Check command record status
    assert record.status == "success"
    assert record.error is None

    # 2. Verify the BLE service method was called correctly
    ble_service.set_doser_schedule.assert_awaited_once()
    call_args = ble_service.set_doser_schedule.call_args
    assert call_args[0][0] == address
    assert call_args[1]["head_index"] == 1  # Updated to match 1-based indexing
    assert call_args[1]["volume_tenths_ml"] == 55
    assert call_args[1]["hour"] == 10
    assert call_args[1]["minute"] == 30
    assert call_args[1]["weekdays"] == [
        PumpWeekday.monday,
        PumpWeekday.wednesday,
        PumpWeekday.friday,
    ]

    # 3. Verify the configuration was saved correctly
    saved_config = ble_service._doser_storage.get_device(address)
    assert saved_config is not None
    active_config = saved_config.get_active_configuration()
    head_config = active_config.latest_revision().heads[
        0
    ]  # First head in list (index=1)
    assert head_config is not None
    assert head_config.schedule.dailyDoseMl == 5.5
    assert head_config.schedule.startTime == "10:30"
    assert set(head_config.recurrence.days) == {"Mon", "Wed", "Fri"}


async def test_execute_add_light_auto_setting_success(
    command_executor: CommandExecutor, ble_service: BLEService, tmp_path: Path
):
    """Verify add_auto_setting command and config persistence for lights."""
    address = "11:22:33:44:55:66"
    device_profile = create_default_light_profile(address)
    ble_service._light_storage.upsert_device(device_profile)

    # Mock the BLE command method
    mock_status = CachedStatus(
        address=address,
        device_type="light",
        raw_payload=None,
        parsed={},
        updated_at=0,
    )
    ble_service.add_light_auto_setting = AsyncMock(return_value=mock_status)

    # Define the command request
    request = CommandRequest(
        action="add_auto_setting",
        args={
            "sunrise": "08:00",
            "sunset": "20:00",
            "brightness": 80,
            "ramp_up_minutes": 15,
            "weekdays": [LightWeekday.saturday, LightWeekday.sunday],
        },
    )

    # Execute the command
    record = await command_executor.execute_command(address, request)

    # --- Assertions ---
    # 1. Check command record status
    assert record.status == "success"
    assert record.error is None

    # 2. Verify the BLE service method was called correctly
    ble_service.add_light_auto_setting.assert_awaited_once()
    call_args = ble_service.add_light_auto_setting.call_args
    assert call_args[0][0] == address
    assert call_args[1]["sunrise"] == time(8, 0)
    assert call_args[1]["sunset"] == time(20, 0)
    assert call_args[1]["brightness"] == 80
    assert call_args[1]["weekdays"] == [
        LightWeekday.saturday,
        LightWeekday.sunday,
    ]

    # 3. Verify the configuration was saved correctly
    saved_profile = ble_service._light_storage.get_device(address)
    assert saved_profile is not None
    active_config = saved_profile.get_active_configuration()
    profile_revision = active_config.latest_revision()

    # After add_auto_setting, the profile should be converted to AutoProfile
    from aquarium_device_manager.light_storage import AutoProfile

    assert isinstance(profile_revision.profile, AutoProfile)

    auto_profile = profile_revision.profile
    assert len(auto_profile.programs) == 1
    program = auto_profile.programs[0]
    assert program.sunrise == "08:00"
    assert program.sunset == "20:00"
    assert program.rampMinutes == 15
    # Check weekdays conversion from enum to string
    assert set(program.days) == {"Sat", "Sun"}
