"""Tests for encoder sanitization and framing helpers."""

from aquarium_device_manager.commands import encoder


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


def test_head_dose_command_legacy_single_byte():
    """Test that values <= 255 use legacy 1-byte format (mode 0x1B)."""
    msg_id = (0, 1)
    head_index = 2
    volume_tenths_ml = 100  # 10.0mL - within single byte range
    weekday_mask = 0x7F  # All days

    frame = encoder.create_head_dose_command(
        msg_id, head_index, volume_tenths_ml, weekday_mask=weekday_mask
    )

    # Check that it uses mode 0x1B (legacy format) - mode is at index 5
    assert frame[5] == 0x1B

    # Check the volume is encoded as single byte at the end
    payload_start = 6  # After header
    payload = frame[payload_start:-1]  # Exclude checksum
    assert payload[-1] == volume_tenths_ml  # Last byte should be volume


def test_head_dose_command_two_byte_format():
    """Test that values > 255 use new 2-byte format (mode 0x1C)."""
    msg_id = (0, 1)
    head_index = 1
    volume_tenths_ml = 5000  # 500.0mL - requires 2 bytes
    weekday_mask = 0x3F  # Mon-Sat

    frame = encoder.create_head_dose_command(
        msg_id, head_index, volume_tenths_ml, weekday_mask=weekday_mask
    )

    # Check that it uses mode 0x1C (new 2-byte format) - mode is at index 5
    assert frame[5] == 0x1C

    # Check the volume is encoded as 2 bytes at the end (big-endian)
    payload_start = 6  # After header
    payload = frame[payload_start:-1]  # Exclude checksum
    volume_high = payload[-2]  # Second to last byte
    volume_low = payload[-1]  # Last byte
    reconstructed_volume = (volume_high << 8) | volume_low
    assert reconstructed_volume == volume_tenths_ml


def test_head_dose_command_maximum_volume():
    """Test maximum supported volume (65535 tenths = 6553.5mL)."""
    msg_id = (0, 1)
    head_index = 0
    volume_tenths_ml = 65535  # Maximum 2-byte value
    weekday_mask = 0x01  # Sunday only

    frame = encoder.create_head_dose_command(
        msg_id, head_index, volume_tenths_ml, weekday_mask=weekday_mask
    )

    # Should use 2-byte format - mode is at index 5
    assert frame[5] == 0x1C

    # Verify correct encoding
    payload_start = 6
    payload = frame[payload_start:-1]
    volume_high = payload[-2]
    volume_low = payload[-1]
    reconstructed_volume = (volume_high << 8) | volume_low
    assert reconstructed_volume == 65535


def test_head_dose_command_volume_validation():
    """Test volume validation bounds."""
    msg_id = (0, 1)
    head_index = 0
    weekday_mask = 0x01

    # Test invalid volumes
    import pytest

    # Negative volume should fail
    with pytest.raises(
        ValueError, match="volume_tenths_ml must fit in two bytes"
    ):
        encoder.create_head_dose_command(
            msg_id, head_index, -1, weekday_mask=weekday_mask
        )

    # Volume too large should fail
    with pytest.raises(
        ValueError, match="volume_tenths_ml must fit in two bytes"
    ):
        encoder.create_head_dose_command(
            msg_id, head_index, 65536, weekday_mask=weekday_mask
        )

    # Valid boundary values should work
    encoder.create_head_dose_command(
        msg_id, head_index, 0, weekday_mask=weekday_mask
    )
    encoder.create_head_dose_command(
        msg_id, head_index, 65535, weekday_mask=weekday_mask
    )
