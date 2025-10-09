"""
API routes for device configuration management.

These endpoints provide CRUD operations for saved device configurations,
allowing the frontend to view, edit, and manage device configurations
independently of active device connections.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from ..ble_service import DEVICE_CONFIG_PATH, DOSER_CONFIG_PATH
from ..doser_storage import DeviceMetadata, DoserDevice, DoserStorage
from ..light_storage import LightDevice, LightMetadata, LightStorage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/configurations", tags=["configurations"])


# Dependency injection for storage instances
def get_doser_storage() -> DoserStorage:
    """Get DoserStorage instance."""
    return DoserStorage(DOSER_CONFIG_PATH)


def get_light_storage() -> LightStorage:
    """Get LightStorage instance."""
    return LightStorage(DEVICE_CONFIG_PATH)


# ============================================================================
# Doser Configuration Endpoints
# ============================================================================


@router.get("/dosers", response_model=List[DoserDevice])
async def list_doser_configurations(
    storage: DoserStorage = Depends(get_doser_storage),
):
    """
    Get all saved doser configurations.

    Returns a list of all doser configurations stored in the system.
    These configurations persist across device connections and can be
    used to quickly restore or sync settings to devices.
    """
    try:
        devices = storage.list_devices()
        logger.info(f"Retrieved {len(devices)} doser configurations")
        return devices
    except Exception as e:
        logger.error(f"Error listing doser configurations: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to list configurations: {str(e)}"
        )


@router.get("/dosers/metadata", response_model=List[DeviceMetadata])
async def list_doser_metadata(
    storage: DoserStorage = Depends(get_doser_storage),
):
    """
    Get metadata for all dosers (both full devices and metadata-only).

    Returns lightweight device information for all known dosers,
    including those with only name metadata and those with full
    configurations.
    """
    try:
        metadata_list = storage.list_device_metadata()
        logger.info(f"Retrieved metadata for {len(metadata_list)} dosers")
        return metadata_list
    except Exception as e:
        logger.error(f"Error listing doser metadata: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to list metadata: {str(e)}"
        )


@router.get("/dosers/{address}", response_model=DoserDevice)
async def get_doser_configuration(
    address: str, storage: DoserStorage = Depends(get_doser_storage)
):
    """
    Get a specific doser configuration by device address.

    Args:
        address: The MAC address of the doser device

    Returns:
        The doser configuration if found

    Raises:
        404: If no configuration exists for this address
    """
    device = storage.get_device(address)
    if not device:
        raise HTTPException(
            status_code=404,
            detail=f"No configuration found for doser {address}",
        )
    logger.info(f"Retrieved configuration for doser {address}")
    return device


@router.put("/dosers/{address}", response_model=DoserDevice)
async def update_doser_configuration(
    address: str,
    device: DoserDevice,
    storage: DoserStorage = Depends(get_doser_storage),
):
    """
    Update or create a doser configuration.

    Args:
        address: The MAC address of the doser device
        device: The complete device configuration to save

    Returns:
        The updated configuration

    Note:
        The address in the URL must match the id in the device object.
    """
    if device.id != address:
        raise HTTPException(
            status_code=400,
            detail=f"Address mismatch: URL has {address}, body has {device.id}",
        )

    try:
        storage.upsert_device(device)
        logger.info(f"Updated configuration for doser {address}")
        return device
    except Exception as e:
        logger.error(f"Error updating doser configuration: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to update configuration: {str(e)}"
        )


@router.delete("/dosers/{address}", status_code=204)
async def delete_doser_configuration(
    address: str, storage: DoserStorage = Depends(get_doser_storage)
):
    """
    Delete a doser configuration.

    Args:
        address: The MAC address of the doser device

    Returns:
        204 No Content on success

    Raises:
        404: If no configuration exists for this address
    """
    if not storage.get_device(address):
        raise HTTPException(
            status_code=404,
            detail=f"No configuration found for doser {address}",
        )

    try:
        storage.delete_device(address)
        logger.info(f"Deleted configuration for doser {address}")
        return None
    except Exception as e:
        logger.error(f"Error deleting doser configuration: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to delete configuration: {str(e)}"
        )


# ============================================================================
# Doser Metadata Endpoints (Name-only storage)
# ============================================================================


@router.get("/dosers/{address}/metadata", response_model=DeviceMetadata)
async def get_doser_metadata(
    address: str,
    storage: DoserStorage = Depends(get_doser_storage),
):
    """
    Get device metadata (names only) for a doser.

    This endpoint returns lightweight device information including
    device name and head names without full configuration data.
    """
    try:
        metadata = storage.get_device_metadata(address)
        if metadata is None:
            raise HTTPException(
                status_code=404, detail=f"No metadata found for doser {address}"
            )
        return metadata
    except Exception as e:
        logger.error(f"Error retrieving doser metadata: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve metadata: {str(e)}"
        )


@router.put("/dosers/{address}/metadata", response_model=DeviceMetadata)
async def update_doser_metadata(
    address: str,
    metadata: DeviceMetadata,
    storage: DoserStorage = Depends(get_doser_storage),
):
    """
    Update or create device metadata (names only) for a doser.

    This endpoint allows setting device name and head names without
    creating full device configurations. Use this for server-side
    name storage before sending any device commands.
    """
    if metadata.id != address:
        raise HTTPException(
            status_code=400,
            detail=f"Address mismatch: URL has {address}, body has {metadata.id}",
        )

    try:
        updated_metadata = storage.upsert_device_metadata(metadata)
        logger.info(f"Updated metadata for doser {address}")
        return updated_metadata
    except Exception as e:
        logger.error(f"Error updating doser metadata: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to update metadata: {str(e)}"
        )


# ============================================================================
# Light Configuration Endpoints
# ============================================================================


@router.get("/lights", response_model=List[LightDevice])
async def list_light_configurations(
    storage: LightStorage = Depends(get_light_storage),
):
    """
    Get all saved light configurations.

    Returns a list of all light profiles stored in the system.
    These profiles persist across device connections and can be
    used to quickly restore or sync settings to devices.
    """
    try:
        devices = storage.list_devices()
        logger.info(f"Retrieved {len(devices)} light profiles")
        return devices
    except Exception as e:
        logger.error(f"Error listing light profiles: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to list profiles: {str(e)}"
        )


@router.get("/lights/metadata", response_model=List[LightMetadata])
async def list_light_metadata(
    storage: LightStorage = Depends(get_light_storage),
):
    """
    Get metadata for all lights.

    Returns lightweight metadata for all known light devices,
    including just names and basic info without full schedules.

    Returns:
        List of light metadata
    """
    try:
        metadata_list = storage.list_light_metadata()
        logger.info(f"Retrieved {len(metadata_list)} light metadata entries")
        return metadata_list
    except Exception as e:
        logger.error(f"Error listing light metadata: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to list metadata: {str(e)}"
        )


@router.get("/lights/{address}", response_model=LightDevice)
async def get_light_configuration(
    address: str, storage: LightStorage = Depends(get_light_storage)
):
    """
    Get a specific light profile by device address.

    Args:
        address: The MAC address of the light device

    Returns:
        The light profile if found

    Raises:
        404: If no profile exists for this address
    """
    device = storage.get_device(address)
    if not device:
        raise HTTPException(
            status_code=404, detail=f"No profile found for light {address}"
        )
    logger.info(f"Retrieved profile for light {address}")
    return device


@router.get("/lights/{address}/metadata", response_model=LightMetadata | None)
async def get_light_metadata(
    address: str,
    storage: LightStorage = Depends(get_light_storage),
):
    """
    Get light metadata by device address.

    Args:
        address: The MAC address of the light device

    Returns:
        The light metadata if found, null otherwise
    """
    try:
        metadata = storage.get_light_metadata(address)
        if metadata:
            logger.info(f"Retrieved metadata for light {address}")
        return metadata
    except Exception as e:
        logger.error(
            f"Error getting light metadata for {address}: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to get metadata: {str(e)}"
        )


@router.put("/lights/{address}", response_model=LightDevice)
async def update_light_configuration(
    address: str,
    device: LightDevice,
    storage: LightStorage = Depends(get_light_storage),
):
    """
    Update or create a light profile.

    Args:
        address: The MAC address of the light device
        device: The complete device profile to save

    Returns:
        The updated profile

    Note:
        The address in the URL must match the id in the device object.
    """
    if device.id != address:
        raise HTTPException(
            status_code=400,
            detail=f"Address mismatch: URL has {address}, body has {device.id}",
        )

    try:
        storage.upsert_device(device)
        logger.info(f"Updated profile for light {address}")
        return device
    except Exception as e:
        logger.error(f"Error updating light profile: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to update profile: {str(e)}"
        )


@router.delete("/lights/{address}", status_code=204)
async def delete_light_configuration(
    address: str, storage: LightStorage = Depends(get_light_storage)
):
    """
    Delete a light profile.

    Args:
        address: The MAC address of the light device

    Returns:
        204 No Content on success

    Raises:
        404: If no profile exists for this address
    """
    if not storage.get_device(address):
        raise HTTPException(
            status_code=404, detail=f"No profile found for light {address}"
        )

    try:
        storage.delete_device(address)
        logger.info(f"Deleted profile for light {address}")
        return None
    except Exception as e:
        logger.error(f"Error deleting light profile: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to delete profile: {str(e)}"
        )


# ============================================================================
# Configuration Summary Endpoint
# ============================================================================


@router.get("/summary")
async def get_configuration_summary(
    doser_storage: DoserStorage = Depends(get_doser_storage),
    light_storage: LightStorage = Depends(get_light_storage),
):
    """
    Get a summary of all stored configurations.

    Returns:
        A summary object with counts and basic info about stored configurations
    """
    try:
        dosers = doser_storage.list_devices()
        lights = light_storage.list_devices()

        return {
            "total_configurations": len(dosers) + len(lights),
            "dosers": {
                "count": len(dosers),
                "addresses": [d.id for d in dosers],
            },
            "lights": {
                "count": len(lights),
                "addresses": [d.id for d in lights],
            },
            "storage_paths": {
                "doser_configs": str(DOSER_CONFIG_PATH),
                "light_profiles": str(DEVICE_CONFIG_PATH),
            },
        }
    except Exception as e:
        logger.error(f"Error getting configuration summary: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to get summary: {str(e)}"
        )


@router.get("/system/timezone")
async def get_system_timezone() -> dict:
    """Get the system timezone for new device configurations.

    Returns the detected system timezone that will be used as the default
    for new device configurations.

    Returns:
        dict: Contains system timezone information
    """
    try:
        from ..timezone_utils import (
            get_system_timezone,
            get_timezone_for_new_device,
        )

        system_tz = get_system_timezone()
        default_tz = get_timezone_for_new_device()

        return {
            "system_timezone": system_tz,
            "default_for_new_devices": default_tz,
            "note": "This timezone will be used as the default for "
            "new device configurations",
        }
    except Exception as e:
        logger.error(f"Error getting system timezone: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to get timezone: {str(e)}"
        )


@router.put("/lights/{address}/metadata", response_model=LightMetadata)
async def update_light_metadata(
    address: str,
    metadata: LightMetadata,
    storage: LightStorage = Depends(get_light_storage),
):
    """
    Update or create light metadata (name only, no schedules).

    This endpoint allows updating just the display name and basic metadata
    for a light device without creating or modifying any light schedules.

    Args:
        address: The MAC address of the light device
        metadata: Light metadata containing name and basic info

    Returns:
        The updated metadata
    """
    try:
        # Ensure the address matches
        metadata.id = address

        updated_metadata = storage.upsert_light_metadata(metadata)
        logger.info(
            f"Updated metadata for light {address}: {updated_metadata.name}"
        )
        return updated_metadata
    except Exception as e:
        logger.error(
            f"Error updating light metadata for {address}: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to update metadata: {str(e)}"
        )
