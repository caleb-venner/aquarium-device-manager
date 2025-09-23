"""Reusable async API for interacting with Chihiros BLE devices."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator, Iterable, Sequence, Tuple, Type

from bleak import BleakScanner
from bleak.backends.device import BLEDevice

from . import doser_commands
from .device import get_device_from_address, get_model_class_from_name
from .device.base_device import BaseDevice
from .device.doser import Doser, DoserStatus

SupportedDeviceInfo = Tuple[BLEDevice, Type[BaseDevice]]


def filter_supported_devices(
    devices: Iterable[BLEDevice],
) -> list[SupportedDeviceInfo]:
    """Return BLE devices that map to a known Chihiros model."""
    supported: list[SupportedDeviceInfo] = []
    for device in devices:
        name = device.name
        if not name:
            continue
        model_class = get_model_class_from_name(name)
        # type: ignore[attr-defined]
        codes = getattr(model_class, "model_codes", [])
        if not codes:
            continue
        supported.append((device, model_class))
    return supported


async def discover_supported_devices(
    timeout: float = 5.0,
) -> list[SupportedDeviceInfo]:
    """Discover BLE devices and return the supported Chihiros models."""
    discovered = await BleakScanner.discover(timeout=timeout)
    return filter_supported_devices(discovered)


@asynccontextmanager
async def device_session(address: str) -> AsyncIterator[BaseDevice]:
    """Connect to a device and ensure it is disconnected afterwards."""
    device = await get_device_from_address(address)
    try:
        yield device
    finally:
        await device.disconnect()


async def request_doser_status(
    address: str, wait_seconds: float = 2.0
) -> DoserStatus | None:
    """Request the latest status frame from a dosing pump."""
    async with device_session(address) as device:
        if not isinstance(device, Doser):
            raise TypeError("Connected device is not a dosing pump")
        await device.request_status()
        await asyncio.sleep(wait_seconds)
        return device.last_status


async def set_doser_daily_schedule(
    address: str,
    head_index: int,
    volume_tenths_ml: int,
    hour: int,
    minute: int,
    *,
    weekdays: (
        doser_commands.Weekday | Sequence[doser_commands.Weekday] | None
    ) = None,
    confirm: bool = False,
    wait_seconds: float = 1.5,
) -> DoserStatus | None:
    """Configure a dosing schedule for a pump head."""
    async with device_session(address) as device:
        if not isinstance(device, Doser):
            raise TypeError("Connected device is not a dosing pump")
        return await device.set_daily_dose(
            head_index,
            volume_tenths_ml,
            hour,
            minute,
            weekdays=weekdays,
            confirm=confirm,
            wait_seconds=wait_seconds,
        )


async def set_light_brightness(
    address: str, brightness: int, color: str | int = 0
) -> None:
    """Set brightness for a specific color channel on a light."""
    async with device_session(address) as device:
        await device.set_color_brightness(brightness, color)


async def turn_light_on(address: str) -> None:
    """Turn on a light device (all channels to 100%)."""
    async with device_session(address) as device:
        await device.turn_on()


async def turn_light_off(address: str) -> None:
    """Turn off a light device (all channels to 0%)."""
    async with device_session(address) as device:
        await device.turn_off()
