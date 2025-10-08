"""Tests for the FastAPI endpoints and service helpers."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from aquarium_device_manager.ble_service import CachedStatus
from aquarium_device_manager.service import app, service


def _cached(device_type: str = "doser") -> CachedStatus:
    """Return a populated CachedStatus for use in tests."""
    return CachedStatus(
        address="AA:BB:CC:DD:EE:FF",
        device_type=device_type,
        raw_payload="deadbeef",
        parsed={"example": True},
        updated_at=123.456,
        model_name=None,
        channels=None,
    )


async def _noop() -> None:
    """Asynchronous placeholder used when patching service lifecycle."""
    return None


@pytest.fixture()
def test_client(monkeypatch: pytest.MonkeyPatch):
    """Provide a TestClient with lifespan while disabling BLE side-effects."""
    # Prevent automatic reconnects and device discovery
    service._auto_reconnect = False  # type: ignore[attr-defined]
    monkeypatch.setattr(service, "_attempt_reconnect", AsyncMock())
    monkeypatch.setattr(service, "_load_state", AsyncMock())
    with TestClient(app) as client:
        yield client


def test_api_debug_live_status_returns_payload(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Expose live payloads via the debug endpoint without persistence (HTTP)."""
    statuses = [_cached("doser"), _cached("light")]
    mocked = AsyncMock(return_value=(statuses, ["pump offline"]))
    monkeypatch.setattr(service, "get_live_statuses", mocked)
    resp = test_client.post("/api/debug/live-status")
    assert resp.status_code == 200
    data = resp.json()
    mocked.assert_awaited_once_with()
    assert len(data["statuses"]) == 2
    assert data["statuses"][0]["address"] == statuses[0].address
    assert data["errors"] == ["pump offline"]


def test_service_get_live_statuses_avoids_persistence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure live status collection does not touch the persisted cache."""
    doser_status = _cached("doser")
    doser_mock = AsyncMock(return_value=doser_status)
    light_error = HTTPException(status_code=404, detail="Light not reachable")
    light_mock = AsyncMock(side_effect=light_error)

    monkeypatch.setattr(
        service,
        "_refresh_device_status",
        lambda kind, persist=False: (
            doser_mock(persist=persist)
            if kind == "doser"
            else light_mock(persist=persist)
        ),
    )

    statuses, errors = asyncio.run(service.get_live_statuses())

    doser_mock.assert_awaited_once_with(persist=False)
    light_mock.assert_awaited_once_with(persist=False)
    assert statuses == [doser_status]
    assert errors == ["Light not reachable"]


def test_removed_legacy_routes_return_404(test_client: TestClient) -> None:
    """Previously archived legacy routes should now be absent (404)."""
    assert test_client.get("/ui").status_code == 404
    assert test_client.get("/debug").status_code == 404
    # Ensure nested paths also 404
    assert test_client.get("/ui/anything").status_code == 404
    assert test_client.get("/debug/anything").status_code == 404
