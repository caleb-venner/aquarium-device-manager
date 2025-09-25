"""Tests for doser decode tolerance of ±1 minute header/body mismatch."""

from chihiros_device_manager.doser_status import parse_status_payload


def test_doser_status_parsing_tolerates_one_minute_mismatch():
    """Allow body time to differ by one minute from header and parse heads."""
    # Header with weekday=4 (Thu), hour=12, minute=56
    header = bytes([0x5B, 0x18, 0x30, 0x00, 0x01, 0xFE, 0x04, 0x0C, 0x38])
    # Filler bytes, then body-start triplet with weekday/hour/minute = 04:0C:37 (12:55)
    filler = b"\x00" * 12
    body_time = bytes([0x04, 0x0C, 0x37])
    # One head block (9 bytes): mode, hour, minute, extra(4), dosed_hi, dosed_lo
    head = bytes(
        [0x00, 0x0C, 0x37, 0x11, 0x22, 0x33, 0x44, 0x01, 0x2C]
    )  # 0x012C = 300 tenths = 30.0ml
    # Tail (5 bytes): 4 targets + flag
    tail = bytes([0x10, 0x20, 0x30, 0x40, 0x55])

    payload = header + filler + body_time + head + tail

    status = parse_status_payload(payload)

    # Header fields preserved
    assert status.weekday == 0x04
    assert status.hour == 0x0C
    assert status.minute == 0x38

    # Body parsed starting after the body-time triplet (within -1 minute of header)
    assert len(status.heads) >= 1
    h0 = status.heads[0]
    assert h0.mode == 0x00
    assert h0.hour == 0x0C
    assert h0.minute == 0x37
    assert h0.dosed_tenths_ml == 0x012C

    # Tail decoded correctly
    assert status.tail_targets == [0x10, 0x20, 0x30, 0x40]
    assert status.tail_flag == 0x55
