"""Common utilities for device storage operations.

This module provides shared functionality for device storage classes
to avoid code duplication.
"""

from __future__ import annotations

from pathlib import Path
from typing import List


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
