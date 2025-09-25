"""Chihiros led control CLI entrypoint."""

import asyncio
import inspect
from datetime import datetime
from typing import Any

import typer
from bleak.backends.device import BLEDevice
from rich import print
from rich.table import Table
from typing_extensions import Annotated

from . import commands
from . import core_api as api
from . import doser_commands
from .commands import WeekdaySelect
from .device import Doser, LightDevice, get_device_from_address
from .doser_status import parse_status_payload
from .light_status import ParsedLightStatus, parse_light_status

app = typer.Typer()

msg_id = commands.next_message_id()

_WEEKDAY_NAME_MAP = {
    name: member for name, member in doser_commands.Weekday.__members__.items()
}
for _key, _member in list(_WEEKDAY_NAME_MAP.items()):
    _WEEKDAY_NAME_MAP[_key[:3]] = _member


def _parse_weekday_options(
    weekday_names: list[str] | None,
) -> list[doser_commands.Weekday] | None:
    """Convert CLI weekday tokens into Weekday members."""
    if not weekday_names:
        return None
    resolved: list[doser_commands.Weekday] = []
    for name in weekday_names:
        member = _WEEKDAY_NAME_MAP.get(name.lower())
        if member is None:
            choices = ", ".join(sorted(_WEEKDAY_NAME_MAP))
            raise typer.BadParameter(
                f"Invalid weekday '{name}'. Use one of: {choices}"
            )
        resolved.append(member)
    return resolved


def _render_status_payload(payload: bytes) -> None:
    """Print a human friendly breakdown of a status notification."""
    try:
        parsed = parse_status_payload(payload)
    except ValueError as exc:
        print(f"  Unable to parse status: {exc}")
        return

    header_info = []
    if parsed.weekday is not None:
        header_info.append(f"weekday={parsed.weekday}")
    if parsed.hour is not None and parsed.minute is not None:
        header_info.append(f"time={parsed.hour:02d}:{parsed.minute:02d}")
    if parsed.message_id is not None:
        header_info.append(
            f"msg_id={parsed.message_id[0]:02X}:{parsed.message_id[1]:02X}"
        )
    if parsed.response_mode is not None:
        header_info.append(f"mode=0x{parsed.response_mode:02X}")
    if header_info:
        print("  header:", ", ".join(header_info))

    if parsed.heads:
        head_table = Table(
            show_header=True, header_style="bold", box=None, pad_edge=False
        )
        head_table.add_column("#", justify="right")
        head_table.add_column("mode", justify="left")
        head_table.add_column("time", justify="left")
        head_table.add_column("dosed", justify="right", style="blue")
        head_table.add_column("target", justify="right", style="blue")
        for idx, head in enumerate(parsed.heads, start=1):
            target_val: int | None = None
            if idx - 1 < len(parsed.tail_targets):
                target_val = parsed.tail_targets[idx - 1]
            head_table.add_row(
                str(idx),
                head.mode_label(),
                f"{head.hour:02d}:{head.minute:02d}",
                f"{head.dosed_ml():.1f}ml",
                f"{target_val}ml" if target_val is not None else "--",
            )
        print(head_table)

    if len(parsed.tail_targets) > len(parsed.heads):
        start_index = len(parsed.heads)
        remaining = parsed.tail_targets[start_index:]
        if remaining:
            print(
                "  extra targets: "
                + ", ".join(f"{value}ml" for value in remaining)
            )
    if parsed.tail_flag is not None:
        print(f"  tail flag: 0x{parsed.tail_flag:02X}")


async def _prompt(text: str) -> str:
    """Prompt the user for input without blocking the event loop."""
    try:
        return (await asyncio.to_thread(input, text)).strip()
    except EOFError as exc:  # pragma: no cover - interactive guard
        raise typer.Exit() from exc


def _print_discovered_devices(
    devices: list[api.SupportedDeviceInfo],
) -> list[BLEDevice]:
    """Render a table of scan results and return the raw devices."""
    if not devices:
        print("No supported Chihiros devices found.")
        return []
    table = Table("Index", "Product", "Address")
    for idx, (device, model_class) in enumerate(devices):
        product = getattr(model_class, "model_name", device.name or "Unknown")
        table.add_row(str(idx), product, device.address)
    print(table)
    return [device for device, _ in devices]


async def _select_doser_device(
    devices: list[BLEDevice],
) -> tuple[Doser | None, str | None]:
    """Prompt the user to choose a dosing pump from recent scans."""
    selection = await _prompt(
        "Enter device index from last scan or full address (blank to cancel): "
    )
    if not selection:
        return None, None
    address = selection
    if selection.isdigit() and devices:
        index = int(selection)
        if 0 <= index < len(devices):
            address = devices[index].address
        else:
            print(f"Index {index} is out of range.")
            return None, None
    try:
        device = await get_device_from_address(address)
    except Exception as exc:  # pragma: no cover - runtime feedback
        print(f"Failed to resolve device {address}: {exc}")
        return None, None
    if not isinstance(device, Doser):
        print(f"Device at {address} is not recognized as a dosing pump.")
        return None, None
    return device, address


async def _select_light_device(
    devices: list[BLEDevice],
) -> tuple[LightDevice | None, str | None]:
    """Prompt the user to choose a light from recent scans."""
    selection = await _prompt(
        "Enter device index from last scan or full address (blank to cancel): "
    )
    if not selection:
        return None, None
    address = selection
    if selection.isdigit() and devices:
        index = int(selection)
        if 0 <= index < len(devices):
            address = devices[index].address
        else:
            print(f"Index {index} is out of range.")
            return None, None
    try:
        device = await get_device_from_address(address)
    except Exception as exc:  # pragma: no cover - runtime feedback
        print(f"Failed to resolve device {address}: {exc}")
        return None, None
    if not isinstance(device, LightDevice):
        print(f"Device at {address} is not recognized as a supported light.")
        return None, None
    return device, address


def _format_command_bytes(command: bytes | bytearray) -> str:
    """Return a human readable representation of command bytes."""
    return " ".join(f"{byte:02X}" for byte in command)


def _render_light_status(parsed: ParsedLightStatus) -> None:
    """Print parsed light keyframes and markers to the console."""
    print("Light status:")
    if (
        parsed.weekday is not None
        and parsed.current_hour is not None
        and parsed.current_minute is not None
    ):
        time_str = f"{parsed.current_hour:02d}:{parsed.current_minute:02d}"
        print(f"  Weekday {parsed.weekday} Time {time_str}")
    if parsed.keyframes:
        print("  Time   -> Level")
        for frame in parsed.keyframes:
            print(f"  {frame.as_time()} -> {frame.value}%")
    else:
        print("  (no keyframes)")
    if parsed.time_markers:
        markers = ", ".join(f"{h:02d}:{m:02d}" for h, m in parsed.time_markers)
        print(f"  Markers: {markers}")


async def _prompt_weekdays() -> list[doser_commands.Weekday] | None:
    """Interactively collect a weekday mask from the operator."""
    prompt = (
        "Weekdays (comma or space separated names like 'mon tue', "
        "leave blank for all): "
    )
    raw = await _prompt(prompt)
    if not raw:
        return None
    tokens = [token for token in raw.replace(",", " ").split() if token]
    try:
        return _parse_weekday_options(tokens)
    except typer.BadParameter as exc:
        print(exc)
        return None


async def _interactive_doser_menu(timeout: int) -> None:
    """Run the interactive REPL for testing doser commands."""
    discovered_devices: list[BLEDevice] = []
    supported_devices: list[api.SupportedDeviceInfo] = []
    current_device: Doser | None = None
    current_address: str | None = None
    current_light: LightDevice | None = None

    async def _ensure_device_selected() -> Doser | None:
        nonlocal current_device
        if current_device is None:
            print("No dosing pump connected. Select option 1 to connect.")
        return current_device

    async def _discover_devices() -> None:
        nonlocal supported_devices, discovered_devices
        supported_devices = await api.discover_supported_devices(
            timeout=timeout
        )
        discovered_devices = [device for device, _ in supported_devices]

    async def _request_light_status(light: LightDevice) -> None:
        await light.request_status()
        await asyncio.sleep(2)
        status = light.last_status
        if not status:
            print("No status received yet.")
            return
        parsed = parse_light_status(status.raw_payload)
        _render_light_status(parsed)

    try:
        while True:
            print("\n=== Chihiros Doser Menu ===")
            if current_device and current_address:
                hi, lo = current_device.current_msg_id
                status_msg = (
                    f"Connected to {current_device.name} ({current_address})"
                    f" - Current msg_id: {hi:02X} {lo:02X}"
                )
                print(status_msg)
            print("1) Connect to dosing pump")
            print("2) Connect to light")
            print("3) Request status")
            print(
                "4) Configure daily schedule "
                "(prepare + select + dose + schedule)"
            )
            print("5) Send prepare command")
            print("6) Send head select command")
            print("7) Send head dose command")
            print("8) Send head schedule command")
            print("9) Scan for devices (debug)")
            print("10) Request status payload")
            print("11) Disconnect current pump")
            print("0) Exit")

            choice = await _prompt("Select option: ")

            if choice in {"0", "q", "Q", "quit", "exit"}:
                break
            if choice == "1":
                await _discover_devices()
                pump_entries = [
                    (device, model)
                    for device, model in supported_devices
                    if issubclass(model, Doser)
                ]
                if not pump_entries:
                    print("No dosing pumps found.")
                    continue
                if len(pump_entries) == 1:
                    ble_device, model_class = pump_entries[0]
                    if current_device:
                        await current_device.disconnect()
                    if current_light:
                        await current_light.disconnect()
                        current_light = None
                    device = model_class(ble_device)
                    current_device = device
                    current_address = ble_device.address
                    print(
                        f"Connected to {device.name} at {ble_device.address}."
                    )
                    await device.request_status()
                    await asyncio.sleep(2)
                    status = device.last_status
                    if status:
                        _render_status_payload(status.raw_payload)
                    else:
                        print("No status received yet.")
                else:
                    pump_devices = _print_discovered_devices(pump_entries)
                    device, address = await _select_doser_device(pump_devices)
                    if not device:
                        continue
                    if current_device:
                        await current_device.disconnect()
                    if current_light:
                        await current_light.disconnect()
                        current_light = None
                    current_device = device
                    current_address = address
                    print(f"Connected to {device.name} at {address}.")
                    await device.request_status()
                    await asyncio.sleep(2)
                    status = device.last_status
                    if status:
                        _render_status_payload(status.raw_payload)
                    else:
                        print("No status received yet.")
            elif choice == "2":
                await _discover_devices()
                light_entries = [
                    (device, model)
                    for device, model in supported_devices
                    if issubclass(model, LightDevice)
                ]
                if not light_entries:
                    print("No supported lights found.")
                    continue
                if len(light_entries) == 1:
                    ble_device, model_class = light_entries[0]
                    if current_light:
                        await current_light.disconnect()
                    if current_device:
                        await current_device.disconnect()
                        current_device = None
                        current_address = None
                    light = model_class(ble_device)
                    current_light = light
                    print(
                        f"Connected to {light.name} at" "{ble_device.address}."
                    )
                    await _request_light_status(light)
                else:
                    light_devices = _print_discovered_devices(light_entries)
                    light, address = await _select_light_device(light_devices)
                    if not light:
                        continue
                    if current_light:
                        await current_light.disconnect()
                    if current_device:
                        await current_device.disconnect()
                        current_device = None
                        current_address = None
                    current_light = light
                    if address:
                        print(f"Connected to {light.name} at {address}.")
                    await _request_light_status(light)
            elif choice == "3":
                if current_light:
                    await _request_light_status(current_light)
                    continue
                device = await _ensure_device_selected()
                if not device:
                    continue
                await device.request_status()
                await asyncio.sleep(2)
                status = device.last_status
                if status:
                    _render_status_payload(status.raw_payload)
                else:
                    print("No status received yet.")
            elif choice == "4":
                device = await _ensure_device_selected()
                if not device:
                    continue
                try:
                    head_index = int(await _prompt("Head index (0-3): "))
                    volume = int(
                        await _prompt("Dose volume (tenths of mL 0-255): ")
                    )
                    hour = int(await _prompt("Hour (0-23): "))
                    minute = int(await _prompt("Minute (0-59): "))
                except ValueError:
                    print("Invalid numeric input, aborting.")
                    continue
                weekdays = await _prompt_weekdays()
                status = await device.set_daily_dose(
                    head_index,
                    volume,
                    hour,
                    minute,
                    weekdays=weekdays,
                    confirm=True,
                    wait_seconds=2.0,
                )
                print("Daily dosing schedule command sequence sent.")
                if status:
                    _render_status_payload(status.raw_payload)
            elif choice == "5":
                device = await _ensure_device_selected()
                if not device:
                    continue
                stage_input = await _prompt(
                    "Stage value (04 or 05, hex allowed): "
                )
                try:
                    stage = int(
                        stage_input,
                        16 if stage_input.lower().startswith("0x") else 0,
                    )
                except ValueError:
                    print("Invalid stage value.")
                    continue
                try:
                    command = doser_commands.create_prepare_command(
                        device.get_next_msg_id(), stage
                    )
                except ValueError as exc:
                    print(exc)
                    continue
                await device._send_command(command, 3)
                print("Sent prepare:", _format_command_bytes(command))
            elif choice == "6":
                device = await _ensure_device_selected()
                if not device:
                    continue
                try:
                    head_index = int(await _prompt("Head index (0-3): "))
                    flag1 = int(
                        (await _prompt("Flag1 (default 0, blank to skip): "))
                        or "0"
                    )
                    flag2 = int(
                        (await _prompt("Flag2 (default 1, blank to skip): "))
                        or "1"
                    )
                except ValueError:
                    print("Invalid numeric input.")
                    continue
                try:
                    command = doser_commands.create_head_select_command(
                        device.get_next_msg_id(),
                        head_index,
                        flag1=flag1,
                        flag2=flag2,
                    )
                except ValueError as exc:
                    print(exc)
                    continue
                await device._send_command(command, 3)
                print("Sent head select:", _format_command_bytes(command))
            elif choice == "7":
                device = await _ensure_device_selected()
                if not device:
                    continue
                try:
                    head_index = int(await _prompt("Head index (0-3): "))
                    volume = int(await _prompt("Dose volume (0-255): "))
                    schedule_mode = int(
                        (await _prompt("Schedule mode (default 1): ")) or "1"
                    )
                    repeat_flag = int(
                        (await _prompt("Repeat flag (default 1): ")) or "1"
                    )
                    reserved = int(
                        (await _prompt("Reserved byte (default 0): ")) or "0"
                    )
                except ValueError:
                    print("Invalid numeric input.")
                    continue
                weekdays = await _prompt_weekdays()
                if weekdays is None:
                    weekday_mask = doser_commands.encode_weekdays(None)
                else:
                    weekday_mask = doser_commands.encode_weekdays(weekdays)
                try:
                    command = doser_commands.create_head_dose_command(
                        device.get_next_msg_id(),
                        head_index,
                        volume,
                        weekday_mask=weekday_mask,
                        schedule_mode=schedule_mode,
                        repeat_flag=repeat_flag,
                        reserved=reserved,
                    )
                except ValueError as exc:
                    print(exc)
                    continue
                await device._send_command(command, 3)
                print("Sent head dose:", _format_command_bytes(command))
            elif choice == "8":
                device = await _ensure_device_selected()
                if not device:
                    continue
                try:
                    head_index = int(await _prompt("Head index (0-3): "))
                    hour = int(await _prompt("Hour (0-23): "))
                    minute = int(await _prompt("Minute (0-59): "))
                    reserve1 = int(
                        (await _prompt("Reserve1 (default 0): ")) or "0"
                    )
                    reserve2 = int(
                        (await _prompt("Reserve2 (default 0): ")) or "0"
                    )
                except ValueError:
                    print("Invalid numeric input.")
                    continue
                try:
                    command = doser_commands.create_head_schedule_command(
                        device.get_next_msg_id(),
                        head_index,
                        hour,
                        minute,
                        reserve1=reserve1,
                        reserve2=reserve2,
                    )
                except ValueError as exc:
                    print(exc)
                    continue
                await device._send_command(command, 3)
                print("Sent head schedule:", _format_command_bytes(command))
            elif choice == "9":
                await _discover_devices()
                _print_discovered_devices(supported_devices)
            elif choice == "10":
                if current_light and current_light.last_status:
                    light_payload = current_light.last_status.raw_payload.hex(
                        " "
                    ).upper()
                    print("Light raw payload:", light_payload)
                if current_device and current_device.last_status:
                    doser_payload = current_device.last_status.raw_payload.hex(
                        " "
                    ).upper()
                    print("Doser raw payload:", doser_payload)
                if not (
                    (current_light and current_light.last_status)
                    or (current_device and current_device.last_status)
                ):
                    print("No raw payload captured yet.")
            elif choice == "11":
                if current_device:
                    await current_device.disconnect()
                    print("Disconnected dosing pump.")
                current_device = None
                current_address = None
                if current_light:
                    await current_light.disconnect()
                    print("Disconnected light.")
                current_light = None
            else:
                print("Unknown selection. Please choose a valid option.")
    except KeyboardInterrupt:  # pragma: no cover - interactive guard
        pass
    finally:
        if current_device:
            await current_device.disconnect()
        if current_light:
            await current_light.disconnect()


def _run_device_func(device_address: str, **kwargs: Any) -> None:
    """Resolve a device by address and call a coroutine method on it."""
    command_name = inspect.stack()[1][3]

    async def _async_func() -> None:
        dev = await get_device_from_address(device_address)
        if hasattr(dev, command_name):
            await getattr(dev, command_name)(**kwargs)
        else:
            print(f"{dev.__class__.__name__} doesn't support {command_name}")
            raise typer.Abort()

    asyncio.run(_async_func())


@app.command()
def list_devices(timeout: Annotated[int, typer.Option()] = 5) -> None:
    """List all bluetooth devices.

    TODO: add an option to show only Chihiros devices
    """
    supported = asyncio.run(api.discover_supported_devices(timeout=timeout))
    if not supported:
        print("No supported Chihiros devices found.")
        return

    table = Table("Product", "Address")
    for device, model_class in supported:
        product = getattr(model_class, "model_name", device.name or "Unknown")
        table.add_row(product, device.address)
    print("Discovered the following devices:")
    print(table)


@app.command()
def turn_on(device_address: str) -> None:
    """Turn on a light."""
    _run_device_func(device_address)


@app.command()
def turn_off(device_address: str) -> None:
    """Turn off a light."""
    _run_device_func(device_address)


@app.command()
def request_status(
    device_address: str,
    wait: Annotated[float, typer.Option(min=0.5, max=10.0)] = 3.0,
) -> None:
    """Request status from a dosing pump and print a readable summary."""

    async def _async_func() -> None:
        try:
            status = await api.request_doser_status(device_address, wait)
        except TypeError:
            print(f"Device at {device_address} is not a dosing pump.")
            return
        if status:
            _render_status_payload(status.raw_payload)
        else:
            print("No status received from device.")

    asyncio.run(_async_func())


@app.command()
def set_color_brightness(
    device_address: str,
    color: int,
    brightness: Annotated[int, typer.Argument(min=0, max=100)],
) -> None:
    """Set color brightness of a light."""
    _run_device_func(device_address, color=color, brightness=brightness)


@app.command()
def set_brightness(
    device_address: str,
    brightness: Annotated[int, typer.Argument(min=0, max=100)],
) -> None:
    """Set brightness of a light."""
    set_color_brightness(device_address, color=0, brightness=brightness)


@app.command()
def set_rgb_brightness(
    device_address: str,
    brightness: Annotated[tuple[int, int, int], typer.Argument()],
) -> None:
    """Set brightness of a RGB light."""
    _run_device_func(device_address, brightness=brightness)


@app.command()
def add_setting(
    device_address: str,
    sunrise: Annotated[datetime, typer.Argument(formats=["%H:%M"])],
    sunset: Annotated[datetime, typer.Argument(formats=["%H:%M"])],
    max_brightness: Annotated[int, typer.Option(max=100, min=0)] = 100,
    ramp_up_in_minutes: Annotated[int, typer.Option(min=0, max=150)] = 0,
    weekdays: Annotated[list[WeekdaySelect], typer.Option()] = [
        WeekdaySelect.everyday
    ],
) -> None:
    """Add setting to a light."""
    _run_device_func(
        device_address,
        sunrise=sunrise,
        sunset=sunset,
        max_brightness=max_brightness,
        ramp_up_in_minutes=ramp_up_in_minutes,
        weekdays=weekdays,
    )


@app.command()
def add_rgb_setting(
    device_address: str,
    sunrise: Annotated[datetime, typer.Argument(formats=["%H:%M"])],
    sunset: Annotated[datetime, typer.Argument(formats=["%H:%M"])],
    max_brightness: Annotated[tuple[int, int, int], typer.Option()] = (
        100,
        100,
        100,
    ),
    ramp_up_in_minutes: Annotated[int, typer.Option(min=0, max=150)] = 0,
    weekdays: Annotated[list[WeekdaySelect], typer.Option()] = [
        WeekdaySelect.everyday
    ],
) -> None:
    """Add setting to a RGB light."""
    _run_device_func(
        device_address,
        sunrise=sunrise,
        sunset=sunset,
        max_brightness=max_brightness,
        ramp_up_in_minutes=ramp_up_in_minutes,
        weekdays=weekdays,
    )


@app.command()
def remove_setting(
    device_address: str,
    sunrise: Annotated[datetime, typer.Argument(formats=["%H:%M"])],
    sunset: Annotated[datetime, typer.Argument(formats=["%H:%M"])],
    ramp_up_in_minutes: Annotated[int, typer.Option(min=0, max=150)] = 0,
    weekdays: Annotated[list[WeekdaySelect], typer.Option()] = [
        WeekdaySelect.everyday
    ],
) -> None:
    """Remove setting from a light."""
    _run_device_func(
        device_address,
        sunrise=sunrise,
        sunset=sunset,
        ramp_up_in_minutes=ramp_up_in_minutes,
        weekdays=weekdays,
    )


@app.command()
def set_daily_dose(
    device_address: str,
    head_index: Annotated[int, typer.Argument(min=0, max=3)],
    volume_tenths_ml: Annotated[int, typer.Argument(min=0, max=255)],
    hour: Annotated[int, typer.Argument(min=0, max=23)],
    minute: Annotated[int, typer.Argument(min=0, max=59)],
    weekdays: Annotated[
        list[str] | None, typer.Option("--weekday", "-w")
    ] = None,
    confirm: Annotated[
        bool,
        typer.Option(
            "--confirm/--no-confirm",
            help="Request status after programming",
            show_default=True,
        ),
    ] = False,
    wait: Annotated[
        float,
        typer.Option(
            "--wait",
            min=0.5,
            max=10.0,
            help="Seconds to wait for status when --confirm is used",
        ),
    ] = 2.0,
) -> None:
    """Configure a daily dosing schedule for a pump head."""
    resolved_weekdays = _parse_weekday_options(weekdays)

    async def _async_func() -> None:
        try:
            status = await api.set_doser_daily_schedule(
                device_address,
                head_index,
                volume_tenths_ml,
                hour,
                minute,
                weekdays=resolved_weekdays,
                confirm=confirm,
                wait_seconds=wait,
            )
        except TypeError:
            print(f"Device at {device_address} is not a dosing pump.")
            raise typer.Abort()
        print("Daily dosing schedule command sequence sent.")
        if status:
            _render_status_payload(status.raw_payload)

    asyncio.run(_async_func())


@app.command()
def doser_menu(timeout: Annotated[int, typer.Option()] = 5) -> None:
    """Launch an interactive dosing pump control menu."""
    asyncio.run(_interactive_doser_menu(timeout))


@app.command()
def reset_settings(device_address: str) -> None:
    """Reset settings from a light."""
    _run_device_func(device_address)


@app.command()
def enable_auto_mode(device_address: str) -> None:
    """Enable auto mode in a light."""
    _run_device_func(device_address)


if __name__ == "__main__":
    try:
        app()
    except asyncio.CancelledError:
        pass
