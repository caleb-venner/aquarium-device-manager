"""Atomic configuration update utilities.

This module provides utilities for performing atomic partial updates
to device configurations without modifying objects in place.
"""

from __future__ import annotations

import logging
from copy import deepcopy

from .doser_storage import (
    ConfigurationRevision,
    DeviceMetadata,
    DoserDevice,
    DoserHead,
    SingleSchedule,
)

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    """Return current ISO timestamp."""
    from .doser_storage import _now_iso as doser_now_iso

    return doser_now_iso()


class ConfigUpdateError(Exception):
    """Raised when a configuration update fails."""

    pass


def atomic_update_doser_schedule(
    device: DoserDevice,
    head_index: int,
    volume_tenths_ml: int,
    hour: int,
    minute: int,
    weekdays: list | None = None,
) -> DoserDevice:
    """Atomically update a doser head schedule.

    This function creates a new DoserDevice instance with the updated schedule
    rather than modifying the existing one in place. This ensures atomicity -
    either all changes succeed or none do.

    Args:
        device: The DoserDevice to update
        head_index: Index of the head to update (0-based)
        volume_tenths_ml: Daily dose volume in tenths of mL
        hour: Schedule hour (0-23)
        minute: Schedule minute (0-59)
        weekdays: List of weekday names or None for default

    Returns:
        New DoserDevice instance with updated schedule

    Raises:
        ConfigUpdateError: If the update cannot be completed
    """
    try:
        # Deep copy the device to avoid modifying the original
        updated_device = deepcopy(device)

        # Get active configuration
        config = updated_device.get_active_configuration()
        latest = config.latest_revision()

        # Find the head to update
        target_head = None
        for head in latest.heads:
            if head.index == head_index:
                target_head = head
                break

        if target_head is None:
            raise ConfigUpdateError(
                f"Head {head_index} not found in device {device.id} configuration"
            )

        # Update the head schedule
        target_head.active = True
        target_head.schedule = SingleSchedule(
            mode="single",
            dailyDoseMl=volume_tenths_ml / 10.0,
            startTime=f"{hour:02d}:{minute:02d}",
        )

        # Update weekdays if provided
        if weekdays:
            weekday_names = []
            for weekday in weekdays:
                if hasattr(weekday, "name"):
                    # Map PumpWeekday enum names to 3-letter day names
                    day_mapping = {
                        "monday": "Mon",
                        "tuesday": "Tue",
                        "wednesday": "Wed",
                        "thursday": "Thu",
                        "friday": "Fri",
                        "saturday": "Sat",
                        "sunday": "Sun",
                    }
                    weekday_names.append(
                        day_mapping.get(weekday.name.lower(), weekday.name[:3])
                    )
                else:
                    # Already a string
                    weekday_names.append(str(weekday))
            target_head.recurrence.days = weekday_names

        # Update timestamps atomically
        timestamp = _now_iso()
        config.updatedAt = timestamp
        updated_device.updatedAt = timestamp

        logger.info(
            f"Atomically updated head {head_index} schedule: "
            f"{volume_tenths_ml / 10.0}ml at {hour:02d}:{minute:02d}"
        )

        return updated_device

    except Exception as e:
        raise ConfigUpdateError(f"Failed to update doser schedule: {e}") from e


def atomic_update_doser_device_props(
    device: DoserDevice, name: str | None = None, timezone: str | None = None
) -> DoserDevice:
    """Atomically update doser device properties.

    Args:
        device: The DoserDevice to update
        name: New device name (optional)
        timezone: New timezone (optional)

    Returns:
        New DoserDevice instance with updated properties

    Raises:
        ConfigUpdateError: If the update cannot be completed
    """
    try:
        # Deep copy the device to avoid modifying the original
        updated_device = deepcopy(device)

        # Update device fields that were provided
        if name is not None:
            updated_device.name = name

        if timezone is not None:
            updated_device.timezone = timezone

        # Update timestamp
        timestamp = _now_iso()
        updated_device.updatedAt = timestamp

        logger.info(f"Atomically updated device properties for {device.id}")

        return updated_device

    except Exception as e:
        raise ConfigUpdateError(
            f"Failed to update doser device properties: {e}"
        ) from e


def atomic_update_device_metadata(
    metadata: DeviceMetadata,
    name: str | None = None,
    timezone: str | None = None,
    head_names: dict[int, str] | None = None,
) -> DeviceMetadata:
    """Atomically update device metadata.

    Args:
        metadata: The DeviceMetadata to update
        name: New device name (optional)
        timezone: New timezone (optional)
        head_names: New head names mapping (optional)

    Returns:
        New DeviceMetadata instance with updated fields

    Raises:
        ConfigUpdateError: If the update cannot be completed
    """
    try:
        # Deep copy the metadata to avoid modifying the original
        updated_metadata = deepcopy(metadata)

        # Update metadata fields that were provided
        if name is not None:
            updated_metadata.name = name

        if timezone is not None:
            updated_metadata.timezone = timezone

        if head_names is not None:
            updated_metadata.headNames = head_names.copy()

        # Update timestamp
        timestamp = _now_iso()
        updated_metadata.updatedAt = timestamp

        logger.info(f"Atomically updated metadata for device {metadata.id}")

        return updated_metadata

    except Exception as e:
        raise ConfigUpdateError(f"Failed to update device metadata: {e}") from e


def atomic_create_new_revision(
    device: DoserDevice,
    heads: list[DoserHead],
    note: str | None = None,
    saved_by: str | None = None,
) -> DoserDevice:
    """Atomically create a new configuration revision.

    Args:
        device: The DoserDevice to update
        heads: List of DoserHead configurations for the new revision
        note: Optional note for the revision
        saved_by: Optional user identifier

    Returns:
        New DoserDevice instance with the new revision added

    Raises:
        ConfigUpdateError: If the revision cannot be created
    """
    try:
        # Deep copy the device to avoid modifying the original
        updated_device = deepcopy(device)

        # Get active configuration
        config = updated_device.get_active_configuration()

        # Determine next revision number
        next_revision = config.latest_revision().revision + 1

        # Create new revision
        timestamp = _now_iso()
        new_revision = ConfigurationRevision(
            revision=next_revision,
            savedAt=timestamp,
            heads=deepcopy(heads),
            note=note,
            savedBy=saved_by,
        )

        # Add to configuration
        config.revisions.append(new_revision)

        # Update timestamps
        config.updatedAt = timestamp
        updated_device.updatedAt = timestamp

        logger.info(
            f"Atomically created revision {next_revision} for device {device.id}"
        )

        return updated_device

    except Exception as e:
        raise ConfigUpdateError(f"Failed to create new revision: {e}") from e
