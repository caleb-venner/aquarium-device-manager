"""Tests for the FastAPI endpoints and service helpers."""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from chihiros_device_manager import doser_commands
from chihiros_device_manager.service import (
    CachedStatus,
    DoserScheduleRequest,
    LightBrightnessRequest,
    serve_spa,
    service,
    set_doser_schedule,
    set_light_brightness,
)


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

@pytest.fixture(autouse=True)
def patch_service_lifecycle(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid touching real BLE hardware during tests."""
    monkeypatch.setattr(service, "start", _noop)
    monkeypatch.setattr(service, "stop", _noop)


def test_api_doser_schedule_normalizes_weekdays(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure schedule endpoint coerces weekday payloads correctly."""
    mocked = AsyncMock(return_value=_cached("doser"))
    monkeypatch.setattr(service, "set_doser_schedule", mocked)

    payload = DoserScheduleRequest(
        head_index=1,
        volume_tenths_ml=25,
        hour=6,
        minute=30,
        weekdays=["monday", "wednesday"],
        confirm=True,
        wait_seconds=2.0,
    )

    result = asyncio.run(
        set_doser_schedule("AA:AA:AA:AA:AA:AA", payload=payload)
    )

    assert result["device_type"] == "doser"
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
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify light brightness endpoint forwards arguments as provided."""
    mocked = AsyncMock(return_value=_cached("light"))
    monkeypatch.setattr(service, "set_light_brightness", mocked)

    payload = LightBrightnessRequest(brightness=75, color="1")
    result = asyncio.run(
        set_light_brightness("11:22:33:44:55:66", payload=payload)
    )

    assert result["device_type"] == "light"
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


def test_root_redirects_when_spa_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Redirect to the legacy dashboard when the SPA bundle is absent."""
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", False
    )
    response = asyncio.run(serve_spa())
    assert response.status_code == 307
    assert response.headers["location"] == "/ui"


def test_root_serves_spa_when_dist_present(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Return the compiled SPA index when the build directory exists."""
    index_file = tmp_path / "index.html"
    index_file.write_text("<html><body>spa</body></html>", encoding="utf-8")
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", True
    )
    monkeypatch.setattr(
        "chihiros_device_manager.service.FRONTEND_DIST", tmp_path
    )
    response = asyncio.run(serve_spa())
    assert response.status_code == 200
    assert "spa" in response.body.decode()
