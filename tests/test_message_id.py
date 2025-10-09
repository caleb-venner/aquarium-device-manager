"""Tests for message ID generation and management."""

import pytest

from aquarium_device_manager.commands import encoder


def test_next_message_id_basic_increment():
    """Test basic message ID increment behavior."""
    # Start from (0, 0)
    assert encoder.next_message_id((0, 0)) == (0, 1)
    assert encoder.next_message_id((0, 1)) == (0, 2)
    assert encoder.next_message_id((0, 88)) == (0, 89)
    # Skip 90
    assert encoder.next_message_id((0, 89)) == (0, 91)
    assert encoder.next_message_id((0, 91)) == (0, 92)


def test_next_message_id_higher_byte_preservation():
    """Test that higher byte is preserved when incrementing lower byte."""
    # This was the bug - higher byte was incorrectly reset to 0
    assert encoder.next_message_id((5, 0)) == (5, 1)
    assert encoder.next_message_id((5, 88)) == (5, 89)
    assert encoder.next_message_id((5, 89)) == (5, 91)
    assert encoder.next_message_id((10, 254)) == (10, 255)


def test_next_message_id_higher_byte_increment():
    """Test higher byte increment when lower byte wraps."""
    assert encoder.next_message_id((0, 255)) == (1, 0)
    assert encoder.next_message_id((5, 255)) == (6, 0)
    # Skip 90 in higher byte
    assert encoder.next_message_id((89, 255)) == (91, 0)


def test_next_message_id_wraparound():
    """Test wraparound from maximum value."""
    assert encoder.next_message_id((255, 255)) == (0, 1)


def test_next_message_id_skip_reserved_values():
    """Test that reserved value 90 is skipped in both bytes."""
    # Lower byte skip
    assert encoder.next_message_id((0, 89)) == (0, 91)
    assert encoder.next_message_id((5, 89)) == (5, 91)

    # Higher byte skip
    assert encoder.next_message_id((89, 255)) == (91, 0)


def test_next_message_id_validation():
    """Test input validation."""
    # Valid inputs
    encoder.next_message_id((0, 0))
    encoder.next_message_id((255, 255))

    # Invalid inputs
    with pytest.raises(
        ValueError, match="Message ID bytes must be in range 0-255"
    ):
        encoder.next_message_id((-1, 0))

    with pytest.raises(
        ValueError, match="Message ID bytes must be in range 0-255"
    ):
        encoder.next_message_id((0, 256))

    with pytest.raises(
        ValueError, match="Message ID cannot contain reserved value 90"
    ):
        encoder.next_message_id((90, 0))

    with pytest.raises(
        ValueError, match="Message ID cannot contain reserved value 90"
    ):
        encoder.next_message_id((0, 90))


def test_reset_message_id():
    """Test message ID reset function."""
    assert encoder.reset_message_id() == (0, 1)


def test_is_message_id_exhausted():
    """Test message ID exhaustion detection."""
    # Not exhausted
    assert not encoder.is_message_id_exhausted((0, 0))
    assert not encoder.is_message_id_exhausted((229, 255))

    # Exhausted (higher byte >= 230)
    assert encoder.is_message_id_exhausted((230, 0))
    assert encoder.is_message_id_exhausted((255, 255))
