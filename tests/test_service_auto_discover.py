"""Tests for auto-discover interactions with auto-reconnect."""

from __future__ import annotations

import asyncio

from aquarium_device_manager import service as service_mod


def test_auto_discover_skips_auto_reconnect(monkeypatch):
    """Test auto-reconnect is skipped if auto-discover connects devices on startup."""
    svc = service_mod.BLEService()
    svc._auto_discover_on_start = True  # type: ignore[attr-defined]
    svc._auto_reconnect = True  # type: ignore[attr-defined]
    svc._cache.clear()  # ensure empty before start

    async def fake_load_state():
        return None

    async def fake_save_state():
        return None

    async def fake_auto_discover():
        svc._cache["addr"] = service_mod.CachedStatus(
            address="addr",
            device_type="light",
            raw_payload=None,
            parsed=None,
            updated_at=0.0,
            model_name=None,
            channels=None,
        )
        return True

    reconnect_called = False

    async def fake_attempt_reconnect():
        nonlocal reconnect_called
        reconnect_called = True

    monkeypatch.setattr(svc, "_load_state", fake_load_state)
    monkeypatch.setattr(svc, "_save_state", fake_save_state)
    monkeypatch.setattr(svc, "_auto_discover_and_connect", fake_auto_discover)
    monkeypatch.setattr(svc, "_attempt_reconnect", fake_attempt_reconnect)

    asyncio.run(svc.start())

    assert reconnect_called is False


def test_auto_discover_allows_auto_reconnect_when_none_found(monkeypatch):
    """Test auto-reconnect is allowed if auto-discover finds no devices on startup."""
    svc = service_mod.BLEService()
    svc._auto_discover_on_start = True  # type: ignore[attr-defined]
    svc._auto_reconnect = True  # type: ignore[attr-defined]
    svc._cache.clear()

    async def fake_load_state():
        return None

    async def fake_save_state():
        return None

    async def fake_auto_discover():
        return False

    reconnect_called = False

    async def fake_attempt_reconnect():
        nonlocal reconnect_called
        reconnect_called = True

    monkeypatch.setattr(svc, "_load_state", fake_load_state)
    monkeypatch.setattr(svc, "_save_state", fake_save_state)
    monkeypatch.setattr(svc, "_auto_discover_and_connect", fake_auto_discover)
    monkeypatch.setattr(svc, "_attempt_reconnect", fake_attempt_reconnect)

    asyncio.run(svc.start())

    # In the non-blocking startup model the reconnect worker may be
    # scheduled asynchronously by the auto-discover worker. Accept either
    # that the reconnect ran synchronously or that a reconnect task was
    # scheduled.
    assert (
        reconnect_called is True
        or getattr(svc, "_reconnect_task", None) is not None
    )
