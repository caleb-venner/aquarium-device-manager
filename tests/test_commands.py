"""Tests for the unified command system."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from chihiros_device_manager.ble_service import BLEService
from chihiros_device_manager.command_executor import CommandExecutor
from chihiros_device_manager.commands_model import CommandRecord, CommandRequest


@pytest.fixture
def mock_ble_service():
    """Create a mock BLE service."""
    service = MagicMock(spec=BLEService)
    service.turn_light_on = AsyncMock()
    service.turn_light_off = AsyncMock()
    service.set_light_brightness = AsyncMock()
    return service


@pytest.fixture
def command_executor(mock_ble_service):
    """Create command executor with mock BLE service."""
    return CommandExecutor(mock_ble_service)


class TestCommandRecord:
    """Test CommandRecord model."""

    def test_create_record(self):
        """Test creating a command record."""
        record = CommandRecord(
            address="AA:BB:CC:DD:EE:FF", action="turn_on", args=None
        )

        assert record.address == "AA:BB:CC:DD:EE:FF"
        assert record.action == "turn_on"
        assert record.args is None
        assert record.status == "pending"
        assert record.attempts == 0
        assert record.id  # Should have generated ID

    def test_mark_started(self):
        """Test marking command as started."""
        record = CommandRecord(address="test", action="turn_on")
        record.mark_started()

        assert record.status == "running"
        assert record.attempts == 1
        assert record.started_at is not None

    def test_mark_success(self):
        """Test marking command as successful."""
        record = CommandRecord(address="test", action="turn_on")
        result = {"status": "on"}
        record.mark_success(result)

        assert record.status == "success"
        assert record.result == result
        assert record.completed_at is not None
        assert record.is_complete()

    def test_mark_failed(self):
        """Test marking command as failed."""
        record = CommandRecord(address="test", action="turn_on")
        record.mark_failed("Device not found")

        assert record.status == "failed"
        assert record.error == "Device not found"
        assert record.completed_at is not None
        assert record.is_complete()

    def test_to_dict_from_dict(self):
        """Test serialization roundtrip."""
        record = CommandRecord(
            address="test",
            action="set_brightness",
            args={"brightness": 80, "color": 0},
        )
        record.mark_success({"brightness": 80})

        data = record.to_dict()
        restored = CommandRecord.from_dict(data)

        assert restored.address == record.address
        assert restored.action == record.action
        assert restored.args == record.args
        assert restored.status == record.status
        assert restored.result == record.result


class TestCommandRequest:
    """Test CommandRequest validation."""

    def test_valid_turn_on_request(self):
        """Test valid turn_on command request."""
        request = CommandRequest(action="turn_on")
        assert request.action == "turn_on"
        assert request.args is None

    def test_valid_brightness_request(self):
        """Test valid brightness command request."""
        request = CommandRequest(
            action="set_brightness", args={"brightness": 80, "color": 0}
        )
        assert request.action == "set_brightness"
        assert request.args["brightness"] == 80

    def test_timeout_validation(self):
        """Test timeout validation."""
        with pytest.raises(ValueError):
            CommandRequest(action="turn_on", timeout=0.5)  # Too short

        with pytest.raises(ValueError):
            CommandRequest(action="turn_on", timeout=60.0)  # Too long


class TestCommandExecutor:
    """Test command execution."""

    def test_validate_brightness_args(self, command_executor):
        """Test brightness argument validation."""
        # Valid args
        command_executor.validate_command_args(
            "set_brightness", {"brightness": 50, "color": 0}
        )

        # Invalid brightness
        with pytest.raises(ValueError):
            command_executor.validate_command_args(
                "set_brightness", {"brightness": 150}
            )

        # Missing args
        with pytest.raises(ValueError):
            command_executor.validate_command_args("set_brightness", None)

    def test_validate_no_args_commands(self, command_executor):
        """Test validation for commands that take no arguments."""
        # Should work with no args
        command_executor.validate_command_args("turn_on", None)
        command_executor.validate_command_args("turn_on", {})

        # Should fail with args
        with pytest.raises(ValueError):
            command_executor.validate_command_args(
                "turn_on", {"invalid": "arg"}
            )


class TestBLEServiceCommandPersistence:
    """Test command persistence in BLE service."""

    def test_save_and_get_command(self):
        """Test saving and retrieving commands."""
        service = BLEService()
        record = CommandRecord(address="test_device", action="turn_on")

        service.save_command(record)

        commands = service.get_commands("test_device")
        assert len(commands) == 1
        assert commands[0]["action"] == "turn_on"

        retrieved = service.get_command("test_device", record.id)
        assert retrieved["id"] == record.id

    def test_command_history_limit(self):
        """Test command history is limited."""
        service = BLEService()

        # Add more than 50 commands
        for i in range(60):
            record = CommandRecord(address="test_device", action="turn_on")
            service.save_command(record)

        commands = service.get_commands("test_device", limit=None)
        assert len(commands) == 50  # Should be limited to 50

    def test_update_existing_command(self):
        """Test updating an existing command by ID."""
        service = BLEService()
        record = CommandRecord(
            id="test-command-id", address="test_device", action="turn_on"
        )

        # Save initial
        service.save_command(record)
        assert len(service.get_commands("test_device")) == 1

        # Update same ID
        record.mark_success({"status": "on"})
        service.save_command(record)

        # Should still have only 1 command
        commands = service.get_commands("test_device")
        assert len(commands) == 1
        assert commands[0]["status"] == "success"
