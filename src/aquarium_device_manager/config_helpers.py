"""Helper functions for device configuration management.

This module provides utilities for creating default configurations,
updating configurations based on commands, and syncing configurations
between the service and storage.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional, cast

from .commands.encoder import decode_pump_weekdays, pump_weekdays_to_names
from .doser_status import DoserStatus, HeadSnapshot
from .doser_storage import (
    Calibration,
    ConfigurationRevision,
    DeviceConfiguration,
    DoserDevice,
    DoserHead,
    DoserHeadStats,
    Recurrence,
    SingleSchedule,
    Weekday,
)
from .doser_storage import _now_iso as _doser_now_iso
from .light_storage import _now_iso as _light_now_iso
from .timezone_utils import get_timezone_for_new_device

if TYPE_CHECKING:
    from .light_storage import LightDevice

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    """Return current ISO timestamp."""
    return _doser_now_iso()


def create_default_doser_config(
    address: str, name: str | None = None, timezone: str | None = None
) -> DoserDevice:
    """Create a default configuration for a new doser device.

    Args:
        address: The device MAC address
        name: Optional friendly name for the device
        timezone: Timezone string (default: auto-detected system timezone)

    Returns:
        A DoserDevice with default configuration for 4 heads
    """
    device_name = name or f"Doser {address[-8:]}"
    device_timezone = timezone or get_timezone_for_new_device()
    timestamp = _now_iso()

    # Create default heads (all inactive by default)
    default_heads = []
    for idx in range(1, 5):
        head = DoserHead(
            index=idx,  # type: ignore[arg-type]
            label=f"Head {idx}",
            active=False,
            schedule=SingleSchedule(
                mode="single", dailyDoseMl=10.0, startTime="09:00"
            ),
            recurrence=Recurrence(
                days=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            ),
            missedDoseCompensation=False,
            calibration=Calibration(
                mlPerSecond=0.1, lastCalibratedAt=timestamp
            ),
            stats=DoserHeadStats(dosesToday=0, mlDispensedToday=0.0),
        )
        default_heads.append(head)

    # Create initial revision
    revision = ConfigurationRevision(
        revision=1,
        savedAt=timestamp,
        heads=default_heads,
        note="Initial configuration",
        savedBy="system",
    )

    # Create default configuration
    configuration = DeviceConfiguration(
        id="default",
        name="Default Configuration",
        description="Auto-generated default configuration",
        createdAt=timestamp,
        updatedAt=timestamp,
        revisions=[revision],
    )

    # Create device
    device = DoserDevice(
        id=address,
        name=device_name,
        timezone=device_timezone,
        configurations=[configuration],
        activeConfigurationId="default",
        createdAt=timestamp,
        updatedAt=timestamp,
    )

    return device


def create_doser_config_from_status(
    address: str,
    status: DoserStatus,
    existing: Optional[DoserDevice] = None,
    name: str | None = None,
) -> DoserDevice:
    """Create or update a DoserDevice configuration from device status.

    Args:
        address: The device MAC address
        status: Current device status from BLE
        existing: Existing device configuration to update (if any)
        name: Optional friendly name for the device

    Returns:
        Updated or new DoserDevice with configuration from status
    """
    timestamp = _now_iso()

    # Extract heads from status
    heads = []
    for head_snap in status.heads:
        # Determine if head is active based on mode
        is_active = head_snap.mode != 0x04  # 0x04 is disabled mode

        # Try to decode weekday information from device status
        # TODO: Parse per-head weekday information from HeadSnapshot.extra bytes
        # Currently, device status may contain weekday info at device level
        recurrence_days = [
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
            "Sun",
        ]  # Default to all days
        if status.weekday is not None:
            try:
                pump_weekdays = decode_pump_weekdays(status.weekday)
                recurrence_days = pump_weekdays_to_names(pump_weekdays)
                if not recurrence_days:  # Empty list means no days selected
                    recurrence_days = [
                        "Mon",
                        "Tue",
                        "Wed",
                        "Thu",
                        "Fri",
                        "Sat",
                        "Sun",
                    ]
            except Exception:
                # Fall back to all days if decoding fails
                pass

        head = DoserHead(
            index=(
                head_snap.mode + 1 if head_snap.mode < 4 else 1
            ),  # type: ignore[arg-type]
            active=is_active,
            schedule=SingleSchedule(
                mode="single",
                dailyDoseMl=head_snap.dosed_ml() or 10.0,
                startTime=f"{head_snap.hour:02d}:{head_snap.minute:02d}",
            ),
            recurrence=Recurrence(days=cast(list[Weekday], recurrence_days)),
            missedDoseCompensation=False,
            calibration=Calibration(
                mlPerSecond=0.1, lastCalibratedAt=timestamp
            ),
            stats=DoserHeadStats(
                dosesToday=0, mlDispensedToday=head_snap.dosed_ml()
            ),
        )
        heads.append(head)

    if existing:
        # Update existing device with new revision
        logger.info(f"Updating existing config for doser {address}")
        device = existing
        config = device.get_active_configuration()

        # Add new revision
        next_revision = config.latest_revision().revision + 1
        new_revision = ConfigurationRevision(
            revision=next_revision,
            savedAt=timestamp,
            heads=heads,
            note="Updated from device status",
            savedBy="system",
        )
        config.revisions.append(new_revision)
        config.updatedAt = timestamp
        device.updatedAt = timestamp
    else:
        # Create new device
        logger.info(f"Creating new config for doser {address}")
        device_name = name or f"Doser {address[-8:]}"

        revision = ConfigurationRevision(
            revision=1,
            savedAt=timestamp,
            heads=heads,
            note="Created from device status",
            savedBy="system",
        )

        configuration = DeviceConfiguration(
            id="default",
            name="Default Configuration",
            description="Auto-generated from device status",
            createdAt=timestamp,
            updatedAt=timestamp,
            revisions=[revision],
        )

        device = DoserDevice(
            id=address,
            name=device_name,
            timezone=get_timezone_for_new_device(),
            configurations=[configuration],
            activeConfigurationId="default",
            createdAt=timestamp,
            updatedAt=timestamp,
        )

    return device


def update_doser_schedule_config(
    device: DoserDevice, args: Dict[str, Any]
) -> DoserDevice:
    """Update a doser device configuration based on set_schedule command args.

    This function now uses atomic updates to ensure configuration consistency.
    Either all changes succeed or none do, preventing partial state corruption.

    Args:
        device: The DoserDevice to update
        args: Command arguments from set_schedule command

    Returns:
        Updated DoserDevice (new instance)
    """
    from .atomic_config import atomic_update_doser_schedule

    head_index = args["head_index"]
    volume_tenths_ml = args["volume_tenths_ml"]
    hour = args["hour"]
    minute = args["minute"]
    weekdays = args.get("weekdays")

    return atomic_update_doser_schedule(
        device=device,
        head_index=head_index,
        volume_tenths_ml=volume_tenths_ml,
        hour=hour,
        minute=minute,
        weekdays=weekdays,
    )


def update_doser_head_stats(
    device: DoserDevice, head_index: int, status: HeadSnapshot
) -> DoserDevice:
    """Update statistics for a specific doser head.

    Args:
        device: The DoserDevice to update
        head_index: Index of the head (1-4)
        status: Head status snapshot from device

    Returns:
        Updated DoserDevice
    """
    config = device.get_active_configuration()
    latest = config.latest_revision()

    for head in latest.heads:
        if head.index == head_index:
            if head.stats is None:
                head.stats = DoserHeadStats(dosesToday=0, mlDispensedToday=0.0)
            head.stats.mlDispensedToday = status.dosed_ml()
            logger.debug(
                f"Updated head {head_index} stats: {status.dosed_ml()}ml dispensed"
            )
            break

    device.updatedAt = _now_iso()
    return device


# ========== Light Device Configuration Helpers ==========


def create_default_light_profile(
    address: str,
    name: str | None = None,
    channels: list[Dict[str, Any]] | None = None,
) -> LightDevice:
    """Create a default profile for a new light device.

    Args:
        address: The device MAC address
        name: Optional friendly name for the device
        channels: Optional list of channel definitions from device

    Returns:
        A LightDevice with default manual profile
    """
    from .light_storage import (
        ChannelDef,
        LightConfiguration,
        LightDevice,
        LightProfileRevision,
        ManualProfile,
    )

    device_name = name or f"Light {address[-8:]}"
    timestamp = _now_iso()

    # Create default channel definitions if not provided
    if not channels:
        channel_defs = [
            ChannelDef(key="white", label="White", min=0, max=100, step=1),
            ChannelDef(key="red", label="Red", min=0, max=100, step=1),
            ChannelDef(key="green", label="Green", min=0, max=100, step=1),
            ChannelDef(key="blue", label="Blue", min=0, max=100, step=1),
        ]
    else:
        channel_defs = [
            ChannelDef(
                key=ch.get("name", f"channel{ch.get('index', 0)}").lower(),
                label=ch.get("name", f"Channel {ch.get('index', 0)}"),
                min=0,
                max=100,
                step=1,
            )
            for ch in channels
        ]

    # Create default manual profile (all channels at 50%)
    default_levels = {ch.key: 50 for ch in channel_defs}

    # Create a profile revision with the manual profile
    revision = LightProfileRevision(
        revision=1,
        savedAt=timestamp,
        profile=ManualProfile(mode="manual", levels=default_levels),
        note="Auto-generated default configuration",
    )

    # Create a configuration containing the revision
    default_config = LightConfiguration(
        id="default",
        name="Default Configuration",
        description="Auto-generated default configuration",
        revisions=[revision],
        createdAt=timestamp,
        updatedAt=timestamp,
    )

    # Create device
    device = LightDevice(
        id=address,
        name=device_name,
        timezone=get_timezone_for_new_device(),
        channels=channel_defs,
        configurations=[default_config],
        activeConfigurationId="default",
        createdAt=timestamp,
        updatedAt=timestamp,
    )

    return device


def update_light_manual_profile(
    device: LightDevice, levels: Dict[str, int]
) -> LightDevice:
    """Update light device's active manual profile with new levels.

    Args:
        device: The LightDevice to update
        levels: Dictionary of channel keys to brightness values

    Returns:
        Updated LightDevice
    """
    from .light_storage import ManualProfile

    # Get active profile
    active_config = device.get_active_configuration()
    active_profile = active_config.latest_revision()

    # Update or create manual profile
    if isinstance(active_profile.profile, ManualProfile):
        # Update existing manual profile
        active_profile.profile.levels.update(levels)
    else:
        # Convert to manual profile
        active_profile.profile = ManualProfile(mode="manual", levels=levels)

    timestamp = _now_iso()
    active_config.updatedAt = timestamp
    device.updatedAt = timestamp

    logger.info(f"Updated light {device.id} manual profile: {levels}")

    return device


def update_light_brightness(
    device: LightDevice, brightness: int, color: int = 0
) -> LightDevice:
    """Update light brightness for a specific color channel.

    Args:
        device: The LightDevice to update
        brightness: Brightness level (0-100)
        color: Color channel index (default: 0 for all/white)

    Returns:
        Updated LightDevice
    """
    from .light_storage import ManualProfile

    # Get active profile
    active_config = device.get_active_configuration()
    active_profile = active_config.latest_revision()

    # Determine which channel to update
    if color < len(device.channels):
        channel_key = device.channels[color].key
    else:
        # Default to first channel
        channel_key = device.channels[0].key if device.channels else "white"

    # Update levels
    levels = {}
    if isinstance(active_profile.profile, ManualProfile):
        levels = dict(active_profile.profile.levels)

    levels[channel_key] = brightness

    # Update profile
    active_profile.profile = ManualProfile(mode="manual", levels=levels)

    timestamp = _now_iso()
    active_config.updatedAt = timestamp
    device.updatedAt = timestamp

    logger.info(
        f"Updated light {device.id} brightness: {channel_key}={brightness}"
    )

    return device


def add_light_auto_program(
    device: LightDevice,
    sunrise: str,
    sunset: str,
    brightness: int,
    ramp_up_minutes: int = 0,
    weekdays: list[str] | None = None,
) -> LightDevice:
    """Add an auto program to light device's active profile.

    Args:
        device: The LightDevice to update
        sunrise: Sunrise time (HH:MM format)
        sunset: Sunset time (HH:MM format)
        brightness: Target brightness level
        ramp_up_minutes: Ramp-up duration in minutes
        weekdays: List of weekdays (default: all days)

    Returns:
        Updated LightDevice
    """
    from uuid import uuid4

    from .light_storage import AutoProfile, AutoProgram, LightProfileRevision

    active_config = device.get_active_configuration()
    active_profile = active_config.latest_revision()

    # Create default levels for all channels
    levels = {ch.key: brightness for ch in device.channels}

    # Convert weekday names to abbreviated format
    weekday_mapping = {
        "monday": "Mon",
        "tuesday": "Tue",
        "wednesday": "Wed",
        "thursday": "Thu",
        "friday": "Fri",
        "saturday": "Sat",
        "sunday": "Sun",
    }

    # Create new auto program
    default_weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    if weekdays:
        program_days = [
            weekday_mapping.get(day.lower(), day) for day in weekdays
        ]
    else:
        program_days = default_weekdays

    new_program = AutoProgram(
        id=str(uuid4()),
        label=f"Auto {sunrise}-{sunset}",
        enabled=True,
        days=program_days,  # type: ignore[arg-type]
        sunrise=sunrise,
        sunset=sunset,
        rampMinutes=ramp_up_minutes,
        levels=levels,
    )

    # Determine the profile to use
    if isinstance(active_profile.profile, AutoProfile):
        # Add to existing auto profile
        existing_programs = active_profile.profile.programs.copy()
        existing_programs.append(new_program)
        new_profile = AutoProfile(mode="auto", programs=existing_programs)
    else:
        # Convert to auto profile with the new program
        new_profile = AutoProfile(mode="auto", programs=[new_program])

    # Create a new revision with the updated profile
    timestamp = _now_iso()
    next_revision = active_profile.revision + 1
    new_revision = LightProfileRevision(
        revision=next_revision,
        savedAt=timestamp,
        profile=new_profile,
        note=f"Added auto program {sunrise}-{sunset}",
        savedBy="system",
    )

    # Add the new revision to the configuration
    active_config.revisions.append(new_revision)
    active_config.updatedAt = timestamp
    device.updatedAt = timestamp

    logger.info(f"Added auto program to light {device.id}: {sunrise}-{sunset}")

    return device


def create_doser_config_from_command(
    address: str, command_args: Dict[str, Any]
) -> DoserDevice:
    """Create a doser configuration from the actual command being sent.

    Args:
        address: Device MAC address
        command_args: Arguments from the schedule command

    Returns:
        DoserDevice with configuration based on the command
    """
    device_name = f"Doser {address[-8:]}"
    device_timezone = get_timezone_for_new_device()
    timestamp = _now_iso()

    # Create heads array with only the commanded head active
    heads = []
    for idx in range(1, 5):
        if idx == command_args["head_index"]:
            # Create the actual scheduled head from command
            weekdays = command_args.get("weekdays")
            if weekdays:
                weekday_strings = [day.value for day in weekdays]
            else:
                weekday_strings = [
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                    "Sun",
                ]

            # Convert volume from tenths to ml
            volume_ml = command_args["volume_tenths_ml"] / 10.0
            start_time = (
                f"{command_args['hour']:02d}:{command_args['minute']:02d}"
            )

            # Convert PumpWeekday enums to strings for Recurrence
            weekdays = command_args.get("weekdays")
            if weekdays:
                # weekdays is List[PumpWeekday] - convert to strings
                weekday_strings = [day.value for day in weekdays]
            else:
                weekday_strings = [
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                    "Sun",
                ]

            head = DoserHead(
                index=idx,  # type: ignore[arg-type]
                label=f"Head {idx}",
                active=True,
                schedule=SingleSchedule(
                    mode="single", dailyDoseMl=volume_ml, startTime=start_time
                ),
                recurrence=Recurrence(days=weekday_strings),  # type: ignore[arg-type]
                missedDoseCompensation=False,
                calibration=Calibration(
                    mlPerSecond=0.1, lastCalibratedAt=timestamp
                ),
                stats=DoserHeadStats(dosesToday=0, mlDispensedToday=0.0),
            )
        else:
            # Inactive head
            head = DoserHead(
                index=idx,  # type: ignore[arg-type]
                label=f"Head {idx}",
                active=False,
                schedule=SingleSchedule(
                    mode="single", dailyDoseMl=10.0, startTime="09:00"
                ),
                recurrence=Recurrence(
                    days=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                ),
                missedDoseCompensation=False,
                calibration=Calibration(
                    mlPerSecond=0.1, lastCalibratedAt=timestamp
                ),
                stats=DoserHeadStats(dosesToday=0, mlDispensedToday=0.0),
            )
        heads.append(head)

    # Create initial revision
    revision = ConfigurationRevision(
        revision=1,
        savedAt=timestamp,
        heads=heads,
        note=f"Created from schedule command for head {command_args['head_index']}",
        savedBy="user-command",
    )

    # Create configuration
    configuration = DeviceConfiguration(
        id="schedule-config",
        name="Schedule Configuration",
        description="Configuration created from schedule command",
        createdAt=timestamp,
        updatedAt=timestamp,
        revisions=[revision],
    )

    # Create device
    device = DoserDevice(
        id=address,
        name=device_name,
        timezone=device_timezone,
        configurations=[configuration],
        activeConfigurationId="schedule-config",
        createdAt=timestamp,
        updatedAt=timestamp,
    )

    return device


def create_light_config_from_command(
    address: str, command_type: str, command_args: Dict[str, Any]
) -> LightDevice:
    """Create a light configuration from the actual command being sent.

    Args:
        address: Device MAC address
        command_type: Type of command ("brightness" or "auto_program")
        command_args: Arguments from the command

    Returns:
        LightDevice with configuration based on the command
    """
    from .light_storage import (
        AutoProfile,
        AutoProgram,
        ChannelDef,
        LightConfiguration,
        LightDevice,
        LightProfileRevision,
        ManualProfile,
    )

    device_name = f"Light {address[-8:]}"
    device_timezone = get_timezone_for_new_device()
    timestamp = _light_now_iso()

    # Default channels (will be updated when device is connected)
    channels = [
        ChannelDef(key="red", label="Red", min=0, max=100, step=1),
        ChannelDef(key="green", label="Green", min=0, max=100, step=1),
        ChannelDef(key="blue", label="Blue", min=0, max=100, step=1),
        ChannelDef(key="white", label="White", min=0, max=100, step=1),
    ]

    if command_type == "brightness":
        # Create manual profile from brightness command
        profile = ManualProfile(
            mode="manual",
            levels={
                "red": command_args["brightness"],
                "green": command_args["brightness"],
                "blue": command_args["brightness"],
                "white": command_args["brightness"],
            },
        )
        config_name = "Manual Brightness"
        description = f"Manual brightness set to {command_args['brightness']}%"
        note = f"Created from brightness command: {command_args['brightness']}%"

    elif command_type == "auto_program":
        # Create auto profile from auto program command
        weekdays = command_args.get("weekdays")
        if weekdays:
            weekday_strings = [day.value for day in weekdays]
        else:
            weekday_strings = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

        # Handle brightness - could be single value or per-channel dict
        brightness_data = command_args.get("brightness") or command_args.get(
            "channels"
        )
        if isinstance(brightness_data, dict):
            # Per-channel brightness from frontend
            levels = {
                "red": brightness_data.get("red", 100),
                "green": brightness_data.get("green", 100),
                "blue": brightness_data.get("blue", 100),
                "white": brightness_data.get("white", 100),
            }
        else:
            # Legacy single brightness value
            brightness_value = (
                brightness_data if brightness_data is not None else 100
            )
            levels = {
                "red": brightness_value,
                "green": brightness_value,
                "blue": brightness_value,
                "white": brightness_value,
            }

        auto_program = AutoProgram(
            id="auto-program-1",
            label="Auto Program",
            enabled=True,
            days=weekday_strings,  # type: ignore[arg-type]
            sunrise=command_args["sunrise"],
            sunset=command_args["sunset"],
            rampMinutes=command_args.get("ramp_up_minutes", 0),
            levels=levels,
        )

        profile = AutoProfile(mode="auto", programs=[auto_program])
        config_name = "Auto Program"
        description = (
            f"Auto program {command_args['sunrise']}-{command_args['sunset']}"
        )
        note = (
            f"Created from auto program command: "
            f"{command_args['sunrise']}-{command_args['sunset']}"
        )

    else:
        raise ValueError(f"Unsupported command type: {command_type}")

    # Create initial revision
    revision = LightProfileRevision(
        revision=1,
        savedAt=timestamp,
        profile=profile,
        note=note,
        savedBy="user-command",
    )

    # Create configuration
    configuration = LightConfiguration(
        id="command-config",
        name=config_name,
        description=description,
        createdAt=timestamp,
        updatedAt=timestamp,
        revisions=[revision],
    )

    # Create device
    device = LightDevice(
        id=address,
        name=device_name,
        timezone=device_timezone,
        channels=channels,
        configurations=[configuration],
        activeConfigurationId="command-config",
        createdAt=timestamp,
        updatedAt=timestamp,
    )

    return device


def filter_device_json_files(storage_dir: Path) -> List[Path]:
    """Filter JSON files in storage directory, excluding .metadata.json files.

    This utility function provides consistent filtering logic for both doser and light
    storage classes to avoid code duplication.

    Args:
        storage_dir: Directory containing device JSON files

    Returns:
        List of Path objects for device configuration files (excluding metadata files)
    """
    if not storage_dir.exists():
        return []

    # Get all .json files except .metadata.json files
    all_json_files = list(storage_dir.glob("*.json"))
    return [f for f in all_json_files if not f.name.endswith(".metadata.json")]


__all__ = [
    "create_default_doser_config",
    "create_doser_config_from_status",
    "create_doser_config_from_command",
    "update_doser_schedule_config",
    "update_doser_head_stats",
    "create_default_light_profile",
    "create_light_config_from_command",
    "update_light_manual_profile",
    "update_light_brightness",
    "add_light_auto_program",
    "filter_device_json_files",
]
