"""Test that the status capture wait respects environment override."""
from __future__ import annotations

import importlib
from unittest.mock import AsyncMock

import pytest


@pytest.fixture()
def patched_wait_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CHIHIROS_STATUS_CAPTURE_WAIT", "0.01")
    # Reload the service module so the constant is re-evaluated from env
    import chihiros_device_manager.service as service_mod

    importlib.reload(service_mod)
    return service_mod


def test_capture_wait_uses_env_override(monkeypatch: pytest.MonkeyPatch, patched_wait_env):
    service_mod = patched_wait_env

    # Speed: ensure no real BLE operations happen.
    service = service_mod.service
    service._doser = AsyncMock()  # type: ignore[attr-defined]
    service._doser_address = "AA:BB"  # type: ignore[attr-defined]
    # Provide a fake status object compatible with serializer expectations.
    # Minimal fake status object; we'll bypass real serialization by patching.
    class FakeStatus:
        def __init__(self):
            self.raw_payload = b"\x00"

    fake_status = FakeStatus()
    service._doser.last_status = fake_status  # type: ignore[attr-defined]

    # Mock request_status (no-op) to avoid real BLE interaction
    async def fake_request_status():  # pragma: no cover
        return None

    service._doser.request_status = AsyncMock(side_effect=fake_request_status)  # type: ignore[attr-defined]

    # Patch serializer to avoid depending on full pump dataclass shape
    monkeypatch.setattr(service_mod._serializers, "_serialize_pump_status", lambda s: {"raw_payload": s.raw_payload.hex()})

    # Patch asyncio.sleep to record the requested delay
    import asyncio as _asyncio
    recorded = {}

    async def fake_sleep(delay):  # pragma: no cover - executed inside test
        recorded["delay"] = delay

    monkeypatch.setattr(_asyncio, "sleep", fake_sleep)

    # Run capture with persist=False so we don't need full serialization path reload complexity
    result = _asyncio.run(service._capture_doser_status(persist=False))  # type: ignore[attr-defined]
    assert result is not None
    # Confirm we used the env override value, not the default 1.5
    assert 0.009 <= recorded.get("delay", 0) <= 0.02, recorded
