"""Exceptions module."""


class CharacteristicMissingError(Exception):
    """Raised when a characteristic is missing."""


class DeviceNotFound(Exception):
    """Raised when BLE device is not found."""


class CommandValidationError(Exception):
    """Raised when command arguments are invalid."""


class DeviceCommunicationError(Exception):
    """Raised when there are issues communicating with a device."""


class DeviceOperationError(Exception):
    """Raised when a device operation fails."""


class CommandTimeoutError(Exception):
    """Raised when a command times out."""
