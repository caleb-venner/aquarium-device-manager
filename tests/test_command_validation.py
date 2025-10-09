"""Tests for command argument validation."""

import pytest
from pydantic import ValidationError

from aquarium_device_manager.commands.encoder import LightWeekday, PumpWeekday
from aquarium_device_manager.commands_model import (
    DoserScheduleArgs,
    LightAutoSettingArgs,
    LightBrightnessArgs,
)


class TestDoserScheduleArgsValidation:
    """Test validation for DoserScheduleArgs."""

    def test_valid_schedule_args(self):
        """Test valid doser schedule arguments."""
        args = DoserScheduleArgs(
            head_index=0,
            volume_tenths_ml=1000,
            hour=12,
            minute=30,
            weekdays=[PumpWeekday.monday, PumpWeekday.wednesday],
            confirm=True,
            wait_seconds=2.0,
        )
        assert args.head_index == 0
        assert args.volume_tenths_ml == 1000
        assert args.hour == 12
        assert args.minute == 30
        assert args.weekdays == [PumpWeekday.monday, PumpWeekday.wednesday]

    def test_head_index_validation(self):
        """Test head index validation."""
        # Valid indices
        for i in range(4):
            args = DoserScheduleArgs(
                head_index=i,
                volume_tenths_ml=100,
                hour=12,
                minute=0,
                confirm=True,
                wait_seconds=2.0,
            )
            assert args.head_index == i

        # Invalid indices
        with pytest.raises(ValidationError, match="Head index must be 0-3"):
            DoserScheduleArgs(
                head_index=-1,
                volume_tenths_ml=100,
                hour=12,
                minute=0,
                confirm=True,
                wait_seconds=2.0,
            )

        with pytest.raises(ValidationError, match="Head index must be 0-3"):
            DoserScheduleArgs(
                head_index=4,
                volume_tenths_ml=100,
                hour=12,
                minute=0,
                confirm=True,
                wait_seconds=2.0,
            )

    def test_weekday_validation(self):
        """Test weekday validation."""
        # Valid weekdays
        args = DoserScheduleArgs(
            head_index=0,
            volume_tenths_ml=100,
            hour=12,
            minute=0,
            weekdays=[PumpWeekday.monday, PumpWeekday.tuesday],
            confirm=True,
            wait_seconds=2.0,
        )
        assert len(args.weekdays) == 2

        # Valid everyday
        args = DoserScheduleArgs(
            head_index=0,
            volume_tenths_ml=100,
            hour=12,
            minute=0,
            weekdays=[PumpWeekday.everyday],
            confirm=True,
            wait_seconds=2.0,
        )
        assert args.weekdays == [PumpWeekday.everyday]

        # Empty weekdays should fail
        with pytest.raises(
            ValidationError, match="Weekdays list cannot be empty"
        ):
            DoserScheduleArgs(
                head_index=0,
                volume_tenths_ml=100,
                hour=12,
                minute=0,
                weekdays=[],
                confirm=True,
                wait_seconds=2.0,
            )

        # Everyday + specific days should fail
        with pytest.raises(
            ValidationError,
            match="Cannot combine 'everyday' with specific weekdays",
        ):
            DoserScheduleArgs(
                head_index=0,
                volume_tenths_ml=100,
                hour=12,
                minute=0,
                weekdays=[PumpWeekday.everyday, PumpWeekday.monday],
                confirm=True,
                wait_seconds=2.0,
            )

        # Duplicates should fail
        with pytest.raises(
            ValidationError, match="Duplicate weekdays not allowed"
        ):
            DoserScheduleArgs(
                head_index=0,
                volume_tenths_ml=100,
                hour=12,
                minute=0,
                weekdays=[PumpWeekday.monday, PumpWeekday.monday],
                confirm=True,
                wait_seconds=2.0,
            )


class TestLightBrightnessArgsValidation:
    """Test validation for LightBrightnessArgs."""

    def test_valid_brightness_args(self):
        """Test valid light brightness arguments."""
        args = LightBrightnessArgs(brightness=50, color=2)
        assert args.brightness == 50
        assert args.color == 2

    def test_color_index_validation(self):
        """Test color index validation."""
        # Valid indices (any non-negative integer for now)
        for i in range(10):  # Test 0-9 to ensure no upper bound
            args = LightBrightnessArgs(brightness=50, color=i)
            assert args.color == i

        # Invalid indices (negative values)
        with pytest.raises(
            ValidationError, match="Color index must be non-negative"
        ):
            LightBrightnessArgs(brightness=50, color=-1)

        with pytest.raises(
            ValidationError, match="Color index must be non-negative"
        ):
            LightBrightnessArgs(brightness=50, color=-5)


class TestLightAutoSettingArgsValidation:
    """Test validation for LightAutoSettingArgs."""

    def test_valid_auto_setting_args(self):
        """Test valid light auto setting arguments."""
        args = LightAutoSettingArgs(
            sunrise="06:30",
            sunset="18:45",
            brightness=75,
            ramp_up_minutes=30,
            weekdays=[LightWeekday.monday, LightWeekday.wednesday],
        )
        assert args.sunrise == "06:30"
        assert args.sunset == "18:45"
        assert args.brightness == 75
        assert args.ramp_up_minutes == 30

    def test_time_format_validation(self):
        """Test time format validation."""
        # Valid times
        valid_times = ["00:00", "12:30", "23:59"]
        for time_str in valid_times:
            # Use a sunset that's guaranteed to be after sunrise
            sunset_time = "23:59"
            args = LightAutoSettingArgs(
                sunrise=time_str,
                sunset=sunset_time,
                brightness=50,
                ramp_up_minutes=0,
                weekdays=[LightWeekday.monday],
            )
            assert args.sunrise == time_str

        # Invalid formats
        invalid_formats = ["1:30", "12:3", "ab:cd", "12", "12:30:45"]
        for time_str in invalid_formats:
            with pytest.raises(ValidationError):
                LightAutoSettingArgs(
                    sunrise=time_str,
                    sunset="18:00",
                    brightness=50,
                    ramp_up_minutes=0,
                    weekdays=[LightWeekday.monday],
                )

        # Invalid hour ranges
        with pytest.raises(ValidationError, match="Hours must be 0-23"):
            LightAutoSettingArgs(
                sunrise="24:30",
                sunset="18:00",
                brightness=50,
                ramp_up_minutes=0,
                weekdays=[LightWeekday.monday],
            )

        # Invalid minute ranges
        with pytest.raises(ValidationError, match="Minutes must be 0-59"):
            LightAutoSettingArgs(
                sunrise="12:60",
                sunset="18:00",
                brightness=50,
                ramp_up_minutes=0,
                weekdays=[LightWeekday.monday],
            )

    def test_sunset_after_sunrise_validation(self):
        """Test sunset after sunrise validation."""
        # Valid: sunset after sunrise
        args = LightAutoSettingArgs(
            sunrise="06:30",
            sunset="18:45",
            brightness=50,
            ramp_up_minutes=0,
            weekdays=[LightWeekday.monday],
        )
        assert args.sunrise == "06:30"
        assert args.sunset == "18:45"

        # Valid: sunset same minute as sunrise (edge case)
        args = LightAutoSettingArgs(
            sunrise="12:30",
            sunset="12:30",
            brightness=50,
            ramp_up_minutes=0,
            weekdays=[LightWeekday.monday],
        )
        assert args.sunset == "12:30"

        # Invalid: sunset before sunrise
        with pytest.raises(
            ValidationError, match="Sunset .* must be after sunrise"
        ):
            LightAutoSettingArgs(
                sunrise="18:45",
                sunset="06:30",
                brightness=50,
                ramp_up_minutes=0,
                weekdays=[LightWeekday.monday],
            )

    def test_ramp_time_validation(self):
        """Test ramp time validation."""
        # Valid ramp times
        args = LightAutoSettingArgs(
            sunrise="06:30",
            sunset="18:45",
            brightness=50,
            ramp_up_minutes=60,
            weekdays=[LightWeekday.monday],
        )
        assert args.ramp_up_minutes == 60

        # Negative ramp time
        with pytest.raises(
            ValidationError, match="Ramp up minutes cannot be negative"
        ):
            LightAutoSettingArgs(
                sunrise="06:30",
                sunset="18:45",
                brightness=50,
                ramp_up_minutes=-1,
                weekdays=[LightWeekday.monday],
            )

        # Ramp time exceeding span
        with pytest.raises(
            ValidationError,
            match="Ramp up time .* cannot exceed sunrise-sunset span",
        ):
            LightAutoSettingArgs(
                sunrise="12:00",
                sunset="12:30",  # 30 minute span
                brightness=50,
                ramp_up_minutes=60,  # Exceeds span
                weekdays=[LightWeekday.monday],
            )

    def test_weekday_validation(self):
        """Test weekday validation for light auto settings."""
        # Valid weekdays
        args = LightAutoSettingArgs(
            sunrise="06:30",
            sunset="18:00",
            brightness=50,
            ramp_up_minutes=0,
            weekdays=[LightWeekday.monday, LightWeekday.tuesday],
        )
        assert args.weekdays is not None
        assert len(args.weekdays) == 2

        # Valid everyday
        args = LightAutoSettingArgs(
            sunrise="06:30",
            sunset="18:00",
            brightness=50,
            ramp_up_minutes=0,
            weekdays=[LightWeekday.everyday],
        )
        assert args.weekdays == [LightWeekday.everyday]

        # Empty weekdays should fail
        with pytest.raises(
            ValidationError, match="Weekdays list cannot be empty"
        ):
            LightAutoSettingArgs(
                sunrise="06:30",
                sunset="18:00",
                brightness=50,
                ramp_up_minutes=0,
                weekdays=[],
            )

        # Everyday + specific days should fail
        with pytest.raises(
            ValidationError,
            match="Cannot combine 'everyday' with specific weekdays",
        ):
            LightAutoSettingArgs(
                sunrise="06:30",
                sunset="18:00",
                brightness=50,
                ramp_up_minutes=0,
                weekdays=[LightWeekday.everyday, LightWeekday.monday],
            )

        # Duplicates should fail
        with pytest.raises(
            ValidationError, match="Duplicate weekdays not allowed"
        ):
            LightAutoSettingArgs(
                sunrise="06:30",
                sunset="18:00",
                brightness=50,
                ramp_up_minutes=0,
                weekdays=[LightWeekday.monday, LightWeekday.monday],
            )
