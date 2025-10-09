# Package for device commands and protocol implementations.
"""Commands package: Device command implementations and protocol handlers."""

__all__ = [
    "next_message_id",
    "reset_message_id",
    "is_message_id_exhausted",
    "create_set_time_command",
    "create_manual_setting_command",
    "create_add_auto_setting_command",
    "create_delete_auto_setting_command",
    "create_reset_auto_settings_command",
    "create_switch_to_auto_mode_command",
    "create_status_request_command",
    "LightWeekday",
    "PumpWeekday",
    "encode_weekdays",
    "encode_light_weekdays",  # deprecated
    "set_doser_schedule",
    "set_light_brightness",
    "turn_light_on",
    "turn_light_off",
    "enable_auto_mode",
    "set_manual_mode",
    "reset_auto_settings",
    "add_light_auto_setting",
]
from .encoder import (  # noqa: F401 - deprecated, kept for backward compatibility
    LightWeekday,
    PumpWeekday,
    create_add_auto_setting_command,
    create_delete_auto_setting_command,
    create_manual_setting_command,
    create_reset_auto_settings_command,
    create_set_time_command,
    create_status_request_command,
    create_switch_to_auto_mode_command,
    encode_light_weekdays,
    encode_pump_weekdays,
    encode_weekdays,
    is_message_id_exhausted,
    next_message_id,
    reset_message_id,
)
from .ops import (
    add_light_auto_setting,
    enable_auto_mode,
    reset_auto_settings,
    set_doser_schedule,
    set_light_brightness,
    set_manual_mode,
    turn_light_off,
    turn_light_on,
)
