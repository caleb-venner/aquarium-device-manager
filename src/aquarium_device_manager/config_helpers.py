"""Helper functions for device configuration management.

This module provides utilities for creating default configurations,
updating configurations based on commands, and syncing configurations
between the service and storage.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Dict, Optional

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
)
from .doser_storage import _now_iso as _doser_now_iso
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
            recurrence=Recurrence(
                days=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            ),
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

    Args:
        device: The DoserDevice to update
        args: Command arguments from set_schedule command

    Returns:
        Updated DoserDevice
    """
    head_index = args["head_index"]
    volume_tenths_ml = args["volume_tenths_ml"]
    hour = args["hour"]
    minute = args["minute"]
    weekdays = args.get("weekdays")

    # Get active configuration
    config = device.get_active_configuration()
    latest = config.latest_revision()

    # Find and update the head
    head_found = False
    for head in latest.heads:
        if head.index == head_index:
            head_found = True
            head.active = True
            head.schedule = SingleSchedule(
                mode="single",
                dailyDoseMl=volume_tenths_ml / 10.0,
                startTime=f"{hour:02d}:{minute:02d}",
            )
            if weekdays:
                head.recurrence.days = weekdays
            logger.info(
                f"Updated head {head_index} schedule: "
                f"{volume_tenths_ml / 10.0}ml at {hour:02d}:{minute:02d}"
            )
            break

    if not head_found:
        logger.warning(
            f"Head {head_index} not found in device {device.id} configuration"
        )

    # Update timestamps
    timestamp = _now_iso()
    config.updatedAt = timestamp
    device.updatedAt = timestamp

    return device


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

    from .light_storage import AutoProfile, AutoProgram

    active_config = device.get_active_configuration()
    active_profile = active_config.latest_revision()

    # Ensure we have an auto profile
    if not isinstance(active_profile.profile, AutoProfile):
        from .light_storage import AutoProfile

        # Convert to auto profile
        active_profile.profile = AutoProfile(mode="auto", programs=[])

    # Create default levels for all channels
    levels = {ch.key: brightness for ch in device.channels}

    # Create new auto program
    default_weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    program_days = weekdays or default_weekdays

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

    # Add to profile
    active_profile.profile.programs.append(new_program)

    timestamp = _now_iso()
    active_config.updatedAt = timestamp
    device.updatedAt = timestamp

    logger.info(f"Added auto program to light {device.id}: {sunrise}-{sunset}")

    return device


__all__ = [
    "create_default_doser_config",
    "create_doser_config_from_status",
    "update_doser_schedule_config",
    "update_doser_head_stats",
    "create_default_light_profile",
    "update_light_manual_profile",
    "update_light_brightness",
    "add_light_auto_program",
]
