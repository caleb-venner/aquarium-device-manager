"""Tests for the FastAPI endpoints and service helpers."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from chihiros_device_manager import doser_commands
from chihiros_device_manager.service import CachedStatus, app, service


def _cached(device_type: str = "doser") -> CachedStatus:
    """Return a populated CachedStatus for use in tests."""
    return CachedStatus(
        address="AA:BB:CC:DD:EE:FF",
        device_type=device_type,
        raw_payload="deadbeef",
        parsed={"example": True},
        updated_at=123.456,
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


def test_api_doser_schedule_normalizes_weekdays(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ensure schedule endpoint coerces weekday payloads correctly via HTTP."""
    mocked = AsyncMock(return_value=_cached("doser"))
    monkeypatch.setattr(service, "set_doser_schedule", mocked)
    body = {
        "head_index": 1,
        "volume_tenths_ml": 25,
        "hour": 6,
        "minute": 30,
        "weekdays": ["monday", "wednesday"],
        "confirm": True,
        "wait_seconds": 2.0,
    }
    resp = test_client.post("/api/dosers/AA:AA:AA:AA:AA:AA/schedule", json=body)
    assert resp.status_code == 200
    mocked.assert_awaited_once()
    call_kwargs = mocked.await_args.kwargs
    assert call_kwargs["head_index"] == 1
    assert call_kwargs["volume_tenths_ml"] == 25
    assert call_kwargs["hour"] == 6
    assert call_kwargs["minute"] == 30
    assert call_kwargs["wait_seconds"] == 2.0
    assert call_kwargs["confirm"] is True
    assert call_kwargs["weekdays"] == [
        doser_commands.Weekday.monday,
        doser_commands.Weekday.wednesday,
    ]


def test_api_light_brightness_passes_payload(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify light brightness endpoint forwards arguments via HTTP."""
    mocked = AsyncMock(return_value=_cached("light"))
    monkeypatch.setattr(service, "set_light_brightness", mocked)
    body = {"brightness": 75, "color": "1"}
    resp = test_client.post(
        "/api/lights/11:22:33:44:55:66/brightness", json=body
    )
    assert resp.status_code == 200
    mocked.assert_awaited_once()
    call_kwargs = mocked.await_args.kwargs
    assert call_kwargs["brightness"] == 75
    assert call_kwargs["color"] == "1"


def test_service_set_light_brightness_coerces_numeric_color(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Convert numeric colour strings to integers before forwarding."""
    fake_light = type("FakeLight", (), {})()
    fake_light.set_color_brightness = AsyncMock()

    cached = _cached("light")

    monkeypatch.setattr(
        service, "_ensure_light", AsyncMock(return_value=fake_light)
    )
    monkeypatch.setattr(
        service, "_refresh_light_status", AsyncMock(return_value=cached)
    )

    result = asyncio.run(
        service.set_light_brightness("AA:BB", brightness=80, color="2")
    )

    fake_light.set_color_brightness.assert_awaited_once_with(80, 2)
    assert result is cached


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

    monkeypatch.setattr(service, "_capture_doser_status", doser_mock)
    monkeypatch.setattr(service, "_capture_light_status", light_mock)

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
