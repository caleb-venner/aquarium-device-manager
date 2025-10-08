"""Configuration migration utilities for rebranding.

Handles backward-compatible migration from old naming (CHIHIROS_*) to
new naming (AQUA_BLE_*).
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# Environment variable mapping: new name -> old name
ENV_VAR_MAPPING = {
    "AQUA_BLE_SERVICE_HOST": "CHIHIROS_SERVICE_HOST",
    "AQUA_BLE_SERVICE_PORT": "CHIHIROS_SERVICE_PORT",
    "AQUA_BLE_AUTO_RECONNECT": "CHIHIROS_AUTO_RECONNECT",
    "AQUA_BLE_AUTO_DISCOVER": "CHIHIROS_AUTO_DISCOVER_ON_START",
    "AQUA_BLE_STATUS_WAIT": "CHIHIROS_STATUS_CAPTURE_WAIT",
    "AQUA_BLE_FRONTEND_DEV": "CHIHIROS_FRONTEND_DEV_SERVER",
    "AQUA_BLE_FRONTEND_DIST": "CHIHIROS_FRONTEND_DIST",
    "AQUA_BLE_LOG_LEVEL": "CHIHIROS_LOG_LEVEL",
    "AQUA_BLE_AUTO_SAVE": "CHIHIROS_AUTO_SAVE_CONFIG",
    "AQUA_BLE_CONFIG_DIR": "CHIHIROS_CONFIG_DIR",
}

# Directory paths
OLD_CONFIG_DIR = Path.home() / ".chihiros"
NEW_CONFIG_DIR = Path.home() / ".aqua-ble"

_migration_logged = False


def get_env_with_fallback(
    new_name: str, default: str | None = None
) -> str | None:
    """Get environment variable with fallback to old naming.

    Args:
        new_name: New environment variable name (e.g., "AQUA_BLE_LOG_LEVEL")
        default: Default value if neither new nor old name is set

    Returns:
        Environment variable value, or default if not found

    Logs a deprecation warning if old name is used.
    """
    global _migration_logged

    # Try new name first
    value = os.getenv(new_name)
    if value is not None:
        return value

    # Fall back to old name
    old_name = ENV_VAR_MAPPING.get(new_name)
    if old_name:
        value = os.getenv(old_name)
        if value is not None and not _migration_logged:
            logger.warning(
                f"Using deprecated environment variable '{old_name}'. "
                f"Please update to '{new_name}'. "
                f"Support for old names will be removed in v2.0."
            )
            _migration_logged = True
            return value

    return default


def get_config_dir() -> Path:
    """Get configuration directory with migration support.

    Returns:
        Path to configuration directory (new location if migrated, old if not)

    Side effects:
        - Creates new directory if it doesn't exist
        - Migrates old directory to new location if old exists and new doesn't
        - Logs migration actions
    """
    # Check for explicit override
    config_dir_override = get_env_with_fallback("AQUA_BLE_CONFIG_DIR")
    if config_dir_override:
        return Path(config_dir_override)

    # If new directory exists, use it
    if NEW_CONFIG_DIR.exists():
        return NEW_CONFIG_DIR

    # If old directory exists, migrate it
    if OLD_CONFIG_DIR.exists():
        logger.info(
            f"Migrating configuration directory: {OLD_CONFIG_DIR} → {NEW_CONFIG_DIR}"
        )
        try:
            # Copy entire directory tree
            shutil.copytree(OLD_CONFIG_DIR, NEW_CONFIG_DIR)
            logger.info(
                f"Configuration migrated successfully. "
                f"Old directory preserved at {OLD_CONFIG_DIR}"
            )
            return NEW_CONFIG_DIR
        except Exception as e:
            logger.error(
                f"Failed to migrate configuration directory: {e}. "
                f"Falling back to old location."
            )
            return OLD_CONFIG_DIR

    # Neither exists, create new directory
    NEW_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Created configuration directory: {NEW_CONFIG_DIR}")
    return NEW_CONFIG_DIR


def get_env_bool(name: str, default: bool) -> bool:
    """Get boolean environment variable with fallback support.

    Args:
        name: New environment variable name
        default: Default value if not found

    Returns:
        Boolean value from environment or default
    """
    raw = get_env_with_fallback(name)
    if raw is None:
        return default

    s = raw.strip()
    if s == "":
        return default

    lowered = s.lower()
    if lowered in ("1", "true", "yes", "on"):
        return True
    if lowered in ("0", "false", "no", "off"):
        return False

    try:
        return bool(int(s))
    except ValueError:
        return default


def get_env_float(name: str, default: float) -> float:
    """Get float environment variable with fallback support.

    Args:
        name: New environment variable name
        default: Default value if not found or invalid

    Returns:
        Float value from environment or default
    """
    raw = get_env_with_fallback(name)
    if raw is None:
        return default

    try:
        return float(raw)
    except ValueError:
        logger.warning(
            f"Invalid float value for {name}: '{raw}'. Using default: {default}"
        )
        return default
