#!/usr/bin/env python3
"""
Example demonstrating the new multi-channel auto setting functionality.

This shows how the add_multi_channel_setting method works with different
types of lights (RGB, RGBW, etc.) by using their device.colors configuration.
"""

print("Multi-Channel Auto Setting Examples")
print("=" * 40)

# Example 1: RGBW Light (4 channels)
print("\nExample 1: RGBW Light with custom brightness per channel")
print("Device colors: {'R': 0, 'G': 1, 'B': 2, 'W': 3}")

# The method would create a brightness tuple in channel order: (R, G, B, W)
channel_brightness = {
    "R": 80,  # Red at 80%
    "G": 60,  # Green at 60%
    "B": 40,  # Blue at 40%
    "W": 20,  # White at 20%
}
brightness_tuple = tuple(
    channel_brightness[color]
    for color in sorted(
        {"R": 0, "G": 1, "B": 2, "W": 3}.keys(),
        key=lambda x: {"R": 0, "G": 1, "B": 2, "W": 3}[x],
    )
)
print(f"Channel brightness dict: {channel_brightness}")
print(f"Resulting brightness tuple: {brightness_tuple}")

# Example 2: RGB Light (3 channels) - defaults to 100% for all
print("\nExample 2: RGB Light with default brightness")
print("Device colors: {'R': 0, 'G': 1, 'B': 2}")

# All channels default to 100%
brightness_tuple = tuple(
    100
    for _ in sorted(
        {"R": 0, "G": 1, "B": 2}.keys(),
        key=lambda x: {"R": 0, "G": 1, "B": 2}[x],
    )
)
print(f"Resulting brightness tuple: {brightness_tuple}")

# Example 3: Single channel white light
print("\nExample 3: Single channel white light")
print("Device colors: {'W': 0}")

channel_brightness = {"W": 75}  # 75% brightness
brightness_tuple = tuple(
    channel_brightness.get(color, 100)
    for color in sorted({"W": 0}.keys(), key=lambda x: {"W": 0}[x])
)
print(f"Channel brightness dict: {channel_brightness}")
print(f"Resulting brightness tuple: {brightness_tuple}")

print("\nKey Features:")
print("- Uses all available channels from device.colors dict")
print("- Sorts channels by their index order (0, 1, 2, 3...)")
print("- Allows custom brightness per channel (0-100%)")
print("- Defaults to 100% brightness for unspecified channels")
print("- Works with any number of channels (1-4)")
print("- Maintains backward compatibility with existing RGB methods")

print("\nUsage in code:")
print(
    """
# For an RGBW device
await device.add_multi_channel_setting(
    sunrise=datetime(...),
    sunset=datetime(...),
    channel_brightness={"R": 80, "G": 60, "B": 40, "W": 20},
    ramp_up_in_minutes=30
)

# For default 100% on all channels
await device.add_multi_channel_setting(
    sunrise=datetime(...),
    sunset=datetime(...)
)
"""
)
