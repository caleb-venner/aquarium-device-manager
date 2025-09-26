import pytest

from chihiros_device_manager.commands import encoder


def test_checksum_collision_bumps_message_id():
    """If checksum would be 0x5A, encoder should bump message id and retry.

    We'll craft a payload that leads to a checksum of 0x5A for the initial msg id
    and assert that the returned frame's checksum is not 0x5A and that the
    message id in the returned frame is the next message id.
    """
    # Choose a cmd_id and mode that produce a predictable header
    cmd_id = 0xA5
    mode = 0x04
    # Start with a message id likely to produce a checksum collision in our
    # synthetic scenario. We'll use (0, 0) and craft params that lead to 0x5A
    initial_msg_id = (0, 0)

    # Find params that cause a checksum == 0x5A for the raw header+params
    # Brute-force small search over short param sequences for a matching case.
    for p0 in range(0, 256):
        params = [p0]
        frame = bytearray(
            [
                cmd_id,
                0x01,
                len(params) + 5,
                initial_msg_id[0],
                initial_msg_id[1],
                mode,
            ]
        )
        frame.extend(params)
        checksum = encoder._calculate_checksum(frame)
        if checksum == 0x5A:
            # we found a collision case; now use the public encoder to build
            out = encoder._encode_uart_command(
                cmd_id, mode, initial_msg_id, params
            )
            # final byte is the checksum
            assert out[-1] != 0x5A
            # ensure the message id used is the next_message_id(initial_msg_id)
            assert (out[3], out[4]) == encoder.next_message_id(initial_msg_id)
            return

    pytest.skip(
        "Could not find a synthetic checksum collision for a 1-byte param"
    )
