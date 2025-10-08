"""
Tests for configuration API endpoints.

This module tests the REST API endpoints for managing device configurations,
including CRUD operations for both doser and light configurations.
"""

import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from aquarium_device_manager.doser_storage import DoserDevice, DoserHead
from aquarium_device_manager.light_storage import LightDevice
from aquarium_device_manager.service import app


@pytest.fixture
def temp_config_dir(monkeypatch):
    """Create a temporary directory for configuration files during tests."""
    temp_dir = Path(tempfile.mkdtemp())

    # Patch the configuration paths
    from aquarium_device_manager import ble_service

    monkeypatch.setattr(ble_service, "CONFIG_DIR", temp_dir)
    monkeypatch.setattr(
        ble_service, "DOSER_CONFIG_PATH", temp_dir / "doser_configs.json"
    )
    monkeypatch.setattr(
        ble_service, "LIGHT_PROFILE_PATH", temp_dir / "light_profiles.json"
    )

    yield temp_dir

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


@pytest.fixture
def sample_doser():
    """Create a sample doser configuration."""
    return DoserDevice(
        address="AA:BB:CC:DD:EE:FF",
        name="Test Doser",
        heads=[
            DoserHead(head=1, active=True, time="08:00", milliliters=10),
            DoserHead(head=2, active=False, time="00:00", milliliters=0),
            DoserHead(head=3, active=True, time="20:00", milliliters=15),
            DoserHead(head=4, active=False, time="00:00", milliliters=0),
        ],
    )


@pytest.fixture
def sample_light():
    """Create a sample light configuration."""
    return LightDevice(
        address="11:22:33:44:55:66",
        name="Test Light",
        channels=[],
        configurations=[],
    )


# ============================================================================
# Doser Configuration Tests
# ============================================================================


def test_list_doser_configurations_empty(client, temp_config_dir):
    """Test listing doser configurations when none exist."""
    response = client.get("/api/configurations/dosers")
    assert response.status_code == 200
    assert response.json() == []


def test_create_and_get_doser_configuration(
    client, temp_config_dir, sample_doser
):
    """Test creating and retrieving a doser configuration."""
    # Create configuration
    response = client.put(
        f"/api/configurations/dosers/{sample_doser.address}",
        json=sample_doser.model_dump(),
    )
    assert response.status_code == 200
    created = response.json()
    assert created["address"] == sample_doser.address
    assert created["name"] == sample_doser.name

    # Get configuration
    response = client.get(f"/api/configurations/dosers/{sample_doser.address}")
    assert response.status_code == 200
    retrieved = response.json()
    assert retrieved["address"] == sample_doser.address
    assert len(retrieved["heads"]) == 4


def test_list_doser_configurations(client, temp_config_dir, sample_doser):
    """Test listing doser configurations."""
    # Create a configuration first
    client.put(
        f"/api/configurations/dosers/{sample_doser.address}",
        json=sample_doser.model_dump(),
    )

    # List configurations
    response = client.get("/api/configurations/dosers")
    assert response.status_code == 200
    configs = response.json()
    assert len(configs) == 1
    assert configs[0]["address"] == sample_doser.address


def test_update_doser_configuration(client, temp_config_dir, sample_doser):
    """Test updating an existing doser configuration."""
    # Create initial configuration
    client.put(
        f"/api/configurations/dosers/{sample_doser.address}",
        json=sample_doser.model_dump(),
    )

    # Update configuration
    sample_doser.name = "Updated Doser"
    sample_doser.heads[0].milliliters = 20
    response = client.put(
        f"/api/configurations/dosers/{sample_doser.address}",
        json=sample_doser.model_dump(),
    )
    assert response.status_code == 200

    # Verify update
    response = client.get(f"/api/configurations/dosers/{sample_doser.address}")
    updated = response.json()
    assert updated["name"] == "Updated Doser"
    assert updated["heads"][0]["milliliters"] == 20


def test_delete_doser_configuration(client, temp_config_dir, sample_doser):
    """Test deleting a doser configuration."""
    # Create configuration
    client.put(
        f"/api/configurations/dosers/{sample_doser.address}",
        json=sample_doser.model_dump(),
    )

    # Delete configuration
    response = client.delete(
        f"/api/configurations/dosers/{sample_doser.address}"
    )
    assert response.status_code == 204

    # Verify deletion
    response = client.get(f"/api/configurations/dosers/{sample_doser.address}")
    assert response.status_code == 404


def test_get_nonexistent_doser_configuration(client, temp_config_dir):
    """Test getting a doser configuration that doesn't exist."""
    response = client.get("/api/configurations/dosers/00:00:00:00:00:00")
    assert response.status_code == 404


def test_delete_nonexistent_doser_configuration(client, temp_config_dir):
    """Test deleting a doser configuration that doesn't exist."""
    response = client.delete("/api/configurations/dosers/00:00:00:00:00:00")
    assert response.status_code == 404


def test_address_mismatch_doser(client, temp_config_dir, sample_doser):
    """Test that address in URL must match address in body."""
    response = client.put(
        "/api/configurations/dosers/11:11:11:11:11:11",
        json=sample_doser.model_dump(),
    )
    assert response.status_code == 400


# ============================================================================
# Light Configuration Tests
# ============================================================================


def test_list_light_configurations_empty(client, temp_config_dir):
    """Test listing light configurations when none exist."""
    response = client.get("/api/configurations/lights")
    assert response.status_code == 200
    assert response.json() == []


def test_create_and_get_light_configuration(
    client, temp_config_dir, sample_light
):
    """Test creating and retrieving a light configuration."""
    # Create configuration
    response = client.put(
        f"/api/configurations/lights/{sample_light.address}",
        json=sample_light.model_dump(),
    )
    assert response.status_code == 200
    created = response.json()
    assert created["address"] == sample_light.address
    assert created["name"] == sample_light.name

    # Get configuration
    response = client.get(f"/api/configurations/lights/{sample_light.address}")
    assert response.status_code == 200
    retrieved = response.json()
    assert retrieved["address"] == sample_light.address


def test_list_light_configurations(client, temp_config_dir, sample_light):
    """Test listing light configurations."""
    # Create a configuration first
    client.put(
        f"/api/configurations/lights/{sample_light.address}",
        json=sample_light.model_dump(),
    )

    # List configurations
    response = client.get("/api/configurations/lights")
    assert response.status_code == 200
    configs = response.json()
    assert len(configs) == 1
    assert configs[0]["address"] == sample_light.address


def test_delete_light_configuration(client, temp_config_dir, sample_light):
    """Test deleting a light configuration."""
    # Create configuration
    client.put(
        f"/api/configurations/lights/{sample_light.address}",
        json=sample_light.model_dump(),
    )

    # Delete configuration
    response = client.delete(
        f"/api/configurations/lights/{sample_light.address}"
    )
    assert response.status_code == 204

    # Verify deletion
    response = client.get(f"/api/configurations/lights/{sample_light.address}")
    assert response.status_code == 404


def test_address_mismatch_light(client, temp_config_dir, sample_light):
    """Test that address in URL must match address in body."""
    response = client.put(
        "/api/configurations/lights/AA:AA:AA:AA:AA:AA",
        json=sample_light.model_dump(),
    )
    assert response.status_code == 400


# ============================================================================
# Configuration Summary Tests
# ============================================================================


def test_configuration_summary_empty(client, temp_config_dir):
    """Test configuration summary when no configurations exist."""
    response = client.get("/api/configurations/summary")
    assert response.status_code == 200
    summary = response.json()
    assert summary["total_configurations"] == 0
    assert summary["dosers"]["count"] == 0
    assert summary["lights"]["count"] == 0


def test_configuration_summary_with_data(
    client, temp_config_dir, sample_doser, sample_light
):
    """Test configuration summary with both doser and light configurations."""
    # Create configurations
    client.put(
        f"/api/configurations/dosers/{sample_doser.address}",
        json=sample_doser.model_dump(),
    )
    client.put(
        f"/api/configurations/lights/{sample_light.address}",
        json=sample_light.model_dump(),
    )

    # Get summary
    response = client.get("/api/configurations/summary")
    assert response.status_code == 200
    summary = response.json()
    assert summary["total_configurations"] == 2
    assert summary["dosers"]["count"] == 1
    assert summary["lights"]["count"] == 1
    assert sample_doser.address in summary["dosers"]["addresses"]
    assert sample_light.address in summary["lights"]["addresses"]
