"""Integration test to verify metadata file filtering fix works in practice."""

import json
import tempfile
from pathlib import Path

from aquarium_device_manager.doser_storage import DoserStorage
from aquarium_device_manager.light_storage import LightStorage


def test_real_world_metadata_scenario():
    """Test with actual metadata file structure from live system."""
    with tempfile.TemporaryDirectory() as temp_dir:
        storage_dir = Path(temp_dir)

        # Create a real metadata file like the one causing issues
        metadata_file = (
            storage_dir / "58159AE1-5E0A-7915-3207-7868CBF2C600.metadata.json"
        )
        metadata_content = {
            "id": "58159AE1-5E0A-7915-3207-7868CBF2C600",
            "name": "Test Doser",
            "headNames": {"1": "APT1", "2": "Excel", "4": "APT3"},
            "createdAt": "2025-10-09T10:45:20+00:00",
        }
        metadata_file.write_text(json.dumps(metadata_content))

        # Test that storage systems don't try to load the metadata file as a device
        doser_storage = DoserStorage(storage_dir)
        doser_devices = doser_storage.list_devices()
        assert (
            len(doser_devices) == 0
        )  # No devices since metadata files are excluded

        light_storage = LightStorage(storage_dir)
        light_devices = light_storage.list_devices()
        assert (
            len(light_devices) == 0
        )  # No devices since metadata files are excluded

        # Verify files exist as expected
        assert metadata_file.exists()

        # Verify that the files being considered for loading don't include metadata
        device_files_doser = [
            f
            for f in storage_dir.glob("*.json")
            if not f.name.endswith(".metadata.json")
        ]
        assert len(device_files_doser) == 0  # Only metadata file exists


if __name__ == "__main__":
    test_real_world_metadata_scenario()
