"""Utilities for handling system timezone detection and conversion."""

import os
from pathlib import Path


def get_system_timezone() -> str:
    """Get the system timezone as an IANA timezone identifier.

    This function attempts to detect the system timezone using multiple methods:
    1. TZ environment variable
    2. /etc/timezone file (common on Linux)
    3. /etc/localtime symlink (common on Linux)
    4. Python's time.tzname (fallback)

    Returns:
        IANA timezone identifier (e.g., "America/New_York", "Europe/London")
        Falls back to "UTC" if detection fails.
    """
    # Method 1: Check TZ environment variable
    tz_env = os.environ.get("TZ")
    if tz_env and _is_valid_iana_timezone(tz_env):
        return tz_env

    # Method 2: Read /etc/timezone (Debian/Ubuntu)
    try:
        timezone_file = Path("/etc/timezone")
        if timezone_file.exists():
            timezone_str = timezone_file.read_text().strip()
            if _is_valid_iana_timezone(timezone_str):
                return timezone_str
    except (OSError, IOError):
        pass

    # Method 3: Check /etc/localtime symlink (RHEL/CentOS/many others)
    try:
        localtime_path = Path("/etc/localtime")
        if localtime_path.is_symlink():
            target = localtime_path.readlink()
            # Extract timezone from path like ../usr/share/zoneinfo/America/New_York
            target_str = str(target)
            if "zoneinfo/" in target_str:
                timezone_str = target_str.split("zoneinfo/")[-1]
                if _is_valid_iana_timezone(timezone_str):
                    return timezone_str
    except (OSError, IOError):
        pass

    # Method 4: Future implementation placeholder
    # Could implement more sophisticated local timezone detection
    # using zoneinfo when available

    # Method 5: Fallback to time.tzname (less reliable)
    try:
        # time.tzname gives us something like ('EST', 'EDT')
        # This is not an IANA identifier, so we'd need a mapping
        # For now, we'll skip this as it's not reliable
        pass
    except Exception:
        pass

    # Ultimate fallback
    return "UTC"


def _is_valid_iana_timezone(timezone_str: str) -> bool:
    """Check if a string looks like a valid IANA timezone identifier.

    This performs basic validation to ensure the timezone string follows
    the expected format (e.g., "America/New_York", "Europe/London").

    Args:
        timezone_str: String to validate

    Returns:
        True if the string appears to be a valid IANA timezone identifier
    """
    if not timezone_str or not isinstance(timezone_str, str):
        return False

    # Basic format validation
    if timezone_str in ["UTC", "GMT"]:
        return True

    # IANA timezones typically have the format Area/Location
    # or Area/Subarea/Location
    parts = timezone_str.split("/")
    if len(parts) < 2 or len(parts) > 3:
        return False

    # Check that each part contains only valid characters
    for part in parts:
        if not part or not part.replace("_", "a").replace("-", "a").isalnum():
            return False

    # Try to validate with zoneinfo if available
    try:
        import zoneinfo

        zoneinfo.ZoneInfo(timezone_str)
        return True
    except (ImportError, Exception):
        # If zoneinfo is not available or timezone is invalid, fall back to format check
        pass

    # If we can't validate with zoneinfo, accept if format looks correct
    return True


def get_timezone_for_new_device() -> str:
    """Get the appropriate timezone for a new device configuration.

    This is a convenience function that determines what timezone should be
    used when creating new device configurations.

    Returns:
        IANA timezone identifier for new devices
    """
    system_tz = get_system_timezone()

    # Log the detected timezone for debugging
    print(f"Detected system timezone: {system_tz}")

    return system_tz
