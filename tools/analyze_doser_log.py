"""Helper script to inspect Chihiros dosing pump BLE logs.

The pump reuse the Nordic UART protocol already handled by the lighting
integration.  PacketLogger "RAW" exports used in this project contain the
decoded ATT payload twice on each line: once in a truncated string and again
as the raw HCI frame.  This script extracts the UART payload, decodes the
header (command id, message id, mode, parameters) and prints a compact
summary so we can spot patterns while reverse engineering the protocol.

Usage (from the project root)::

    python tools/analyze_doser_log.py \
        "src/chihiros_device_manager/doser packet logs/doser_bt_2_RAW.txt"

The output groups commands (writes) and notifications (indications from the
device) in chronological order.
"""

from __future__ import annotations

import argparse
import dataclasses
import re
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from chihiros_device_manager.doser_status import (  # noqa: E402
    parse_status_payload,
)

LINE_RE = re.compile(
    r"^(?P<timestamp>[^ ]+ [^ ]+ [^ ]+)\s+"
    r"(?P<layer>ATT [A-Za-z]+)\s+"
    r"(?P<handle>0x[0-9A-Fa-f]+)\s+"
    r"(?P<addr>[0-9A-Fa-f:]+)\s+"
    r"(?P<direction>RECV|SEND)\s+"
    r"(?P<message>.*?)\s+Value:\s*(?P<payload>.+)$"
)


@dataclasses.dataclass(slots=True)
class Record:
    """Decoded UART frame captured in the log."""

    timestamp: str
    direction: str
    cmd_id: int
    flag: int
    length: int
    msg_id_hi: int
    msg_id_lo: int
    mode: int
    payload: bytes
    checksum: int

    @property
    def msg_id(self) -> tuple[int, int]:
        return self.msg_id_hi, self.msg_id_lo

    @property
    def kind(self) -> str:
        return "TX" if self.direction == "SEND" else "RX"

    def describe(self) -> str:
        body = " ".join(f"{b:02X}" for b in self.payload)
        return (
            f"[{self.timestamp}] {self.kind} cmd=0x{self.cmd_id:02X} "
            f"mode=0x{self.mode:02X} msg={
                self.msg_id_hi:02X}:{self.msg_id_lo:02X} "
            f"data=[{body}] chk=0x{self.checksum:02X}"
        )


def _extract_uart_bytes(raw_field: str) -> bytes:
    """Return the UART payload from the value column.

    PacketLogger exports repeat the bytes at the ATT layer.  The first token
    is the truncated payload we want; in some cases it still ends with the
    ellipsis character.  When this happens the second token contains the full
    frame prefixed by the ATT header (11 bytes) which we strip away.
    """

    chunks = [
        part.strip() for part in raw_field.strip().split("  ") if part.strip()
    ]
    head = chunks[0].replace("…", "").strip()
    try:
        return bytes.fromhex(head)
    except ValueError:
        if len(chunks) < 2:
            raise
        full_frame = bytes.fromhex(chunks[1])
        # ATT opcode (1), handle (2), offset (2), value length (2) and uuid (4)
        # combine to 11 bytes.
        return full_frame[11:]


def _decode_uart_frame(data: bytes) -> Record:
    if len(data) < 7:
        raise ValueError(f"UART frame too short: {data.hex()}")
    return Record(
        timestamp="",
        direction="",
        cmd_id=data[0],
        flag=data[1],
        length=data[2],
        msg_id_hi=data[3],
        msg_id_lo=data[4],
        mode=data[5],
        payload=data[6:-1],
        checksum=data[-1],
    )


def parse_log(path: Path) -> Iterable[Record]:
    for line in path.read_text().splitlines():
        match = LINE_RE.match(line)
        if not match:
            continue
        payload_bytes = _extract_uart_bytes(match.group("payload"))
        record = _decode_uart_frame(payload_bytes)
        record.timestamp = match.group("timestamp")
        record.direction = match.group("direction")
        yield record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "log", type=Path, help="Path to RAW PacketLogger export"
    )
    args = parser.parse_args()

    for record in parse_log(args.log):
        print(record.describe())
        if record.kind == "RX" and record.mode == 0xFE:
            try:
                status = parse_status_payload(record.payload)
            except ValueError:
                continue
            head_summaries = ", ".join(
                f"h{idx} mode={head.mode_label()}"
                f" time={head.hour:02d}:{head.minute:02d}"
                f" dosed={head.dosed_ml():.1f}ml"
                for idx, head in enumerate(status.heads, start=1)
            )
            header_bits = []
            if status.weekday is not None:
                header_bits.append(f"weekday={status.weekday}")
            if status.hour is not None and status.minute is not None:
                header_bits.append(
                    f"time={status.hour:02d}:{status.minute:02d}"
                )
            if status.message_id is not None:
                header_bits.append(
                    f"msg={status.message_id[0]:02X}:{
                        status.message_id[1]:02X}"
                )
            if status.response_mode is not None:
                header_bits.append(f"resp=0x{status.response_mode:02X}")
            tail_info = ""
            if status.tail_targets:
                tail_info = f" targets={status.tail_targets}"
            if status.tail_flag is not None:
                tail_info += f" flag=0x{status.tail_flag:02X}"
            print(
                f"   status {' '.join(header_bits)}"
                f" tail={status.tail_raw.hex()}"
                f"{tail_info}"
                f" heads=[{head_summaries}]"
            )


if __name__ == "__main__":
    main()
