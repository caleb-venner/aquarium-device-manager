"""Unit tests for light status parsing."""

from chihiros_device_manager.light_status import parse_light_payload


def hex_to_bytes(h: str) -> bytes:
    """Convert a hex string to bytes."""
    return bytes.fromhex(h)


def test_parse_sample_with_repeated_header():
    """Parse a sample with a repeated header inside the body."""
    # sample supplied by user (header repeated inside body)
    hexstr = (
        "5b18300001fe031502000000000000150000000000030315020d00000d1e41"
        "141e4115000012274100000000000000000000"
    )
    parsed = parse_light_payload(hex_to_bytes(hexstr))

    assert parsed.message_id == (0, 1)
    assert parsed.weekday == 3
    # expecting several keyframes parsed after the repeated header
    assert len(parsed.keyframes) >= 3
    # ensure brightness values parsed as ints
    assert all(isinstance(k.value, int) for k in parsed.keyframes)


def test_parse_padding_and_tail():
    """Handle padding and capture tail bytes."""
    # payload with padding triples and tail data
    hexstr = "5b18300001fe0301020000000000000000000000000000"
    parsed = parse_light_payload(hex_to_bytes(hexstr))
    # no keyframes, tail captured
    assert isinstance(parsed.tail, bytes)
