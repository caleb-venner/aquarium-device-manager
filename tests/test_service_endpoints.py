"""Tests for the FastAPI endpoints and service helpers."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from chihiros_device_manager import doser_commands
from chihiros_device_manager.service import CachedStatus, app, service


def _cached(device_type: str = "doser") -> CachedStatus:
    return CachedStatus(
        address="AA:BB:CC:DD:EE:FF",
        device_type=device_type,
        raw_payload="deadbeef",
        parsed={"example": True},
        updated_at=123.456,
    )


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    async def _noop() -> None:
        return None

    monkeypatch.setattr(service, "start", _noop)
    monkeypatch.setattr(service, "stop", _noop)

    with TestClient(app) as test_client:
        yield test_client


def test_api_doser_schedule_normalizes_weekdays(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mocked = AsyncMock(return_value=_cached("doser"))
    monkeypatch.setattr(service, "set_doser_schedule", mocked)

    response = client.post(
        "/api/dosers/AA:AA:AA:AA:AA:AA/schedule",
        json={
            "head_index": 1,
            "volume_tenths_ml": 25,
            "hour": 6,
            "minute": 30,
            "weekdays": ["monday", "wednesday"],
            "confirm": True,
            "wait_seconds": 2.0,
        },
    )

    assert response.status_code == 200
    assert response.json()["device_type"] == "doser"
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
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mocked = AsyncMock(return_value=_cached("light"))
    monkeypatch.setattr(service, "set_light_brightness", mocked)

    response = client.post(
        "/api/lights/11:22:33:44:55:66/brightness",
        json={"brightness": 75, "color": "1"},
    )

    assert response.status_code == 200
    mocked.assert_awaited_once()
    call_kwargs = mocked.await_args.kwargs
    assert call_kwargs["brightness"] == 75
    assert call_kwargs["color"] == "1"


def test_service_set_light_brightness_coerces_numeric_color(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
