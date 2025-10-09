"""Test lifetime totals parsing in doser status."""

from aquarium_device_manager.doser_status import parse_doser_payload


def test_lifetime_totals_parsing():
    """Test that lifetime totals are correctly parsed from counter fragments."""
    # Example payload with lifetime totals (no time fields)
    # Header: 5B 01 0A 00 01 1E
    # Lifetime data: 76 C0 27 97 62 FE 54 FB
    # Trailer: 70
    payload = bytes(
        [
            0x5B,
            0x01,
            0x0A,
            0x00,
            0x01,
            0x1E,  # Header
            0x76,
            0xC0,  # Head 1: 30400 tenths = 3040.0 mL
            0x27,
            0x97,  # Head 2: 10135 tenths = 1013.5 mL
            0x62,
            0xFE,  # Head 3: 25342 tenths = 2534.2 mL
            0x54,
            0xFB,  # Head 4: 21755 tenths = 2175.5 mL
            0x70,  # Trailer
        ]
    )

    status = parse_doser_payload(payload)

    # Should detect this as a lifetime totals payload (no time fields)
    assert status.weekday is None
    assert status.hour is None
    assert status.minute is None

    # Should parse the 4 lifetime totals
    assert len(status.lifetime_totals_tenths_ml) == 4
    assert status.lifetime_totals_tenths_ml[0] == 30400
    assert status.lifetime_totals_tenths_ml[1] == 10135
    assert status.lifetime_totals_tenths_ml[2] == 25342
    assert status.lifetime_totals_tenths_ml[3] == 21755

    # Should convert to mL correctly
    totals_ml = status.lifetime_totals_ml()
    assert len(totals_ml) == 4
    assert totals_ml[0] == 3040.0
    assert totals_ml[1] == 1013.5
    assert totals_ml[2] == 2534.2
    assert totals_ml[3] == 2175.5


def test_regular_status_no_lifetime_totals():
    """Test that regular status payloads don't get lifetime totals parsed."""
    # Regular status payload with time fields (based on test_doser_time_tolerance.py)
    header = bytes([0x5B, 0x18, 0x30, 0x00, 0x01, 0xFE, 0x04, 0x0C, 0x38])
    filler = b"\x00" * 12
    body_time = bytes([0x04, 0x0C, 0x37])
    # Two head blocks (9 bytes each)
    head1 = bytes(
        [0x00, 0x0C, 0x37, 0x11, 0x22, 0x33, 0x44, 0x01, 0x2C]
    )  # 30.0ml
    head2 = bytes(
        [0x01, 0x0D, 0x00, 0x55, 0x66, 0x77, 0x88, 0x00, 0x64]
    )  # 10.0ml
    tail = bytes([0x10, 0x20, 0x30, 0x40, 0x55])

    payload = header + filler + body_time + head1 + head2 + tail

    status = parse_doser_payload(payload)

    # Should parse time fields
    assert status.weekday == 4
    assert status.hour == 12
    assert status.minute == 56  # 0x38

    # Should have head data but no lifetime totals
    assert len(status.heads) == 2
    assert len(status.lifetime_totals_tenths_ml) == 0
    assert status.lifetime_totals_ml() == []
