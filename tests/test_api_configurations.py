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

from aquarium_device_manager.config_helpers import (
    create_default_doser_config,
    create_default_light_profile,
)
from aquarium_device_manager.service import app


@pytest.fixture
def temp_config_dir(monkeypatch):
    """Create a temporary directory for configuration files during tests."""
    temp_dir = Path(tempfile.mkdtemp())

    # Patch the configuration paths in ble_service
    from aquarium_device_manager import ble_service

    monkeypatch.setattr(ble_service, "CONFIG_DIR", temp_dir)
    monkeypatch.setattr(
        ble_service, "DOSER_CONFIG_PATH", temp_dir / "doser_configs.json"
    )
    monkeypatch.setattr(
        ble_service, "LIGHT_PROFILE_PATH", temp_dir / "light_profiles.json"
    )

    # Also patch the paths in the API routes module
    from aquarium_device_manager.api import routes_configurations

    monkeypatch.setattr(
        routes_configurations,
        "DOSER_CONFIG_PATH",
        temp_dir / "doser_configs.json",
    )
    monkeypatch.setattr(
        routes_configurations,
        "DEVICE_CONFIG_PATH",
        temp_dir / "light_profiles.json",
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
    return create_default_doser_config("AA:BB:CC:DD:EE:FF", name="Test Doser")


@pytest.fixture
def sample_light():
    """Create a sample light configuration."""
    return create_default_light_profile("11:22:33:44:55:66", name="Test Light")


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
        f"/api/configurations/dosers/{sample_doser.id}",
        json=sample_doser.model_dump(),
    )
    assert response.status_code == 200
    created = response.json()
    assert created["id"] == sample_doser.id
    assert created["name"] == sample_doser.name

    # Get configuration
    response = client.get(f"/api/configurations/dosers/{sample_doser.id}")
    assert response.status_code == 200
    retrieved = response.json()
    assert retrieved["id"] == sample_doser.id
    assert len(retrieved["configurations"]) >= 1
    # Check that the configuration has heads
    active_config = next(
        c
        for c in retrieved["configurations"]
        if c["id"] == retrieved["activeConfigurationId"]
    )
    latest_revision = active_config["revisions"][-1]
    assert len(latest_revision["heads"]) == 4


def test_list_doser_configurations(client, temp_config_dir, sample_doser):
    """Test listing doser configurations."""
    # Create a configuration first
    client.put(
        f"/api/configurations/dosers/{sample_doser.id}",
        json=sample_doser.model_dump(),
    )

    # List configurations
    response = client.get("/api/configurations/dosers")
    assert response.status_code == 200
    configs = response.json()
    assert len(configs) == 1
    assert configs[0]["id"] == sample_doser.id


def test_update_doser_configuration(client, temp_config_dir, sample_doser):
    """Test updating an existing doser configuration."""
    # Create initial configuration
    client.put(
        f"/api/configurations/dosers/{sample_doser.id}",
        json=sample_doser.model_dump(),
    )

    # Update configuration
    sample_doser.name = "Updated Doser"
    # Update a head's daily dose in the active configuration
    active_config = sample_doser.get_active_configuration()
    latest_revision = active_config.latest_revision()
    latest_revision.heads[0].schedule.dailyDoseMl = 20.0
    response = client.put(
        f"/api/configurations/dosers/{sample_doser.id}",
        json=sample_doser.model_dump(),
    )
    assert response.status_code == 200

    # Verify update
    response = client.get(f"/api/configurations/dosers/{sample_doser.id}")
    updated = response.json()
    assert updated["name"] == "Updated Doser"
    # Check the updated dose in the configuration structure
    active_config = next(
        c
        for c in updated["configurations"]
        if c["id"] == updated["activeConfigurationId"]
    )
    latest_revision = active_config["revisions"][-1]
    assert latest_revision["heads"][0]["schedule"]["dailyDoseMl"] == 20.0


def test_delete_doser_configuration(client, temp_config_dir, sample_doser):
    """Test deleting a doser configuration."""
    # Create configuration
    client.put(
        f"/api/configurations/dosers/{sample_doser.id}",
        json=sample_doser.model_dump(),
    )

    # Delete configuration
    response = client.delete(f"/api/configurations/dosers/{sample_doser.id}")
    assert response.status_code == 204

    # Verify deletion
    response = client.get(f"/api/configurations/dosers/{sample_doser.id}")
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
        f"/api/configurations/lights/{sample_light.id}",
        json=sample_light.model_dump(),
    )
    assert response.status_code == 200
    created = response.json()
    assert created["id"] == sample_light.id
    assert created["name"] == sample_light.name

    # Get configuration
    response = client.get(f"/api/configurations/lights/{sample_light.id}")
    assert response.status_code == 200
    retrieved = response.json()
    assert retrieved["id"] == sample_light.id


def test_list_light_configurations(client, temp_config_dir, sample_light):
    """Test listing light configurations."""
    # Create a configuration first
    client.put(
        f"/api/configurations/lights/{sample_light.id}",
        json=sample_light.model_dump(),
    )

    # List configurations
    response = client.get("/api/configurations/lights")
    assert response.status_code == 200
    configs = response.json()
    assert len(configs) == 1
    assert configs[0]["id"] == sample_light.id


def test_delete_light_configuration(client, temp_config_dir, sample_light):
    """Test deleting a light configuration."""
    # Create configuration
    client.put(
        f"/api/configurations/lights/{sample_light.id}",
        json=sample_light.model_dump(),
    )

    # Delete configuration
    response = client.delete(f"/api/configurations/lights/{sample_light.id}")
    assert response.status_code == 204

    # Verify deletion
    response = client.get(f"/api/configurations/lights/{sample_light.id}")
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
        f"/api/configurations/dosers/{sample_doser.id}",
        json=sample_doser.model_dump(),
    )
    client.put(
        f"/api/configurations/lights/{sample_light.id}",
        json=sample_light.model_dump(),
    )

    # Get summary
    response = client.get("/api/configurations/summary")
    assert response.status_code == 200
    summary = response.json()
    assert summary["total_configurations"] == 2
    assert summary["dosers"]["count"] == 1
    assert summary["lights"]["count"] == 1
    assert sample_doser.id in summary["dosers"]["addresses"]
    assert sample_light.id in summary["lights"]["addresses"]
