"""Manual testing script for the Chihiros dosing pump."""

import asyncio
import argparse
import sys
from pathlib import Path

from bleak import BleakScanner

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from custom_components.chihiros.chihiros_led_control.device.doser import Doser
from custom_components.chihiros.chihiros_led_control.doser_commands import Weekday
from custom_components.chihiros.chihiros_led_control.doser_status import (
    parse_status_payload,
)


async def _discover_device(
    address: str | None, timeout: float, name_prefix: str | None
):
    if address:
        print(f"Searching for {address} (timeout {timeout}s)...")
        device = await BleakScanner.find_device_by_address(
            address,
            timeout=timeout,
            scanning_mode="active",
        )
        if device:
            return device
        print("Direct lookup failed, performing full scan...")
    else:
        print(f"Scanning for devices (timeout {timeout}s)...")

    devices = await BleakScanner.discover(timeout=timeout, scanning_mode="active")
    if address:
        address_upper = address.upper()
        for dev in devices:
            if dev.address.upper() == address_upper:
                return dev
    if name_prefix:
        matches = [
            dev for dev in devices if (dev.name or "").startswith(name_prefix)
        ]
        if len(matches) == 1:
            print(
                "Found device by name prefix",
                matches[0].name,
                matches[0].address,
            )
            return matches[0]
        if len(matches) > 1:
            print("Multiple devices match name prefix; please specify address:")
            for dev in matches:
                print(" -", dev.name, dev.address)
    if not devices:
        print("No BLE devices discovered")
    return None


async def main(
    address: str | None,
    head: int,
    volume: int,
    hour: int,
    minute: int,
    *,
    timeout: float,
    name_prefix: str | None,
    days: str | None,
    read_only: bool,
) -> None:
    device = await _discover_device(address, timeout, name_prefix)
    if device is None:
        raise SystemExit(f"Could not find BLE device {address or name_prefix}")

    doser = Doser(device)
    doser.set_log_level("DEBUG")

    weekday_mask = None
    if days:
        day_tokens = [token.strip().lower() for token in days.split(",") if token.strip()]
        mapping = {
            "mon": Weekday.monday,
            "tue": Weekday.tuesday,
            "wed": Weekday.wednesday,
            "thu": Weekday.thursday,
            "fri": Weekday.friday,
            "sat": Weekday.saturday,
            "sun": Weekday.sunday,
        }
        try:
            weekday_selection = Weekday(0)
            for token in day_tokens:
                weekday_selection |= mapping[token]
        except KeyError as err:
            raise SystemExit(f"Unsupported weekday label: {err.args[0]}") from err
    else:
        weekday_selection = None

    print("Requesting status...")
    await doser.request_status()
    await asyncio.sleep(5)
    if doser.last_status:
        payload = doser.last_status.raw_payload
        print("Received status:", payload.hex())
        try:
            parsed = parse_status_payload(payload)
        except ValueError:
            parsed = None
        if parsed:
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

            for idx, head in enumerate(parsed.heads, start=1):
                print(
                    f"  head {idx}: "
                    f"mode={head.mode_label()} "
                    f"time={head.hour:02d}:{head.minute:02d} "
                    f"dosed={head.dosed_ml():.1f}ml "
                    f"extra={head.extra.hex()}"
                )

            if parsed.tail_targets:
                targets = ", ".join(f"{val}ml" for val in parsed.tail_targets)
                print(f"  targets: {targets}")
            if parsed.tail_flag is not None:
                print(f"  tail flag: 0x{parsed.tail_flag:02X}")
    else:
        print("No status received yet")

    if read_only:
        print("Skipping update (--read-only enabled)")
    else:
        weekday_repr = days or "every day"
        print(
            f"Setting daily dose head={head} volume={volume} tenths ml"
            f" time={hour:02d}:{minute:02d} weekdays={weekday_repr}"
        )
        await doser.set_daily_dose(
            head,
            volume,
            hour,
            minute,
            weekdays=weekday_selection,
        )
        await asyncio.sleep(5)

    print("Done; disconnecting")
    await doser.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "address",
        nargs="?",
        help="BLE MAC/UUID of the dosing pump (optional if --name-prefix works)",
    )
    parser.add_argument("head", type=int, help="Head index 0-3")
    parser.add_argument("volume", type=int, help="Tenths of ml (e.g. 51 for 5.1ml)")
    parser.add_argument("hour", type=int, help="Hour (0-23)")
    parser.add_argument("minute", type=int, help="Minute (0-59)")
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="BLE discovery timeout in seconds (default: 20)",
    )
    parser.add_argument(
        "--name-prefix",
        default="DYDOSE",
        help="Device name prefix to match when address is unknown",
    )
    parser.add_argument(
        "--days",
        help="Comma separated weekday codes mon,tue,wed,thu,fri,sat,sun (default every day)",
    )
    parser.add_argument(
        "--read-only",
        action="store_true",
        help="Only request status; do not send any update commands",
    )
    args = parser.parse_args()

    asyncio.run(
        main(
            args.address,
            args.head,
            args.volume,
            args.hour,
            args.minute,
            timeout=args.timeout,
            name_prefix=args.name_prefix,
            days=args.days,
            read_only=args.read_only,
        )
    )
