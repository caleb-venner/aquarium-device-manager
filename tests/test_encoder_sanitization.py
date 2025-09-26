"""Tests for encoder sanitization and framing helpers."""

from chihiros_device_manager.commands import encoder


def test_sanitization_replaces_0x5a_with_0x59():
    """Ensure payload bytes equal to 0x5A are replaced with 0x59."""
    cmd_id = 0xA5
    mode = 0x04
    msg_id = (0, 1)
    params = [0x5A, 0x10, 0x5A]

    frame = encoder._encode_uart_command(cmd_id, mode, msg_id, params)

    # payload starts at index 6 (0-based): header = 6 bytes
    payload = frame[6:-1]
    assert all(b != 0x5A for b in payload)
    assert payload[0] == 0x59
    assert payload[2] == 0x59
