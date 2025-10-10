# Aquarium Device Controller TODO

## Light Features

- Manual brightness setting should be sent as one payload.
- Should have auto/manual/favourited settings for light devices on the ‘Overview’ page.
- Need to figure out the Custom Mode. I think it just creates a bunch of auto mode settings; the device itself must compute how they all interact.
- Ensure Auto settings do not overlap. One can end at 21:00 with another starting at 21:00; cannot have end 21:01 start 21:00.
- Real time light values - need to be implemented from saved config data.
- What are we exposing as devices, entities, helpers, attributes?
- For light devices that support it —> 140% brightness, dependant on wattage calculations.
Devices --> Settings --> Turn On, Turn Off settings not working; low priority.

## Doser Features

- **Manual/One-time dosing**: No immediate dose commands - need encoder functions and device methods for manual dosing
- **Different schedule types**: Only daily recurring schedules supported - need interval-based, countdown, and conditional dosing modes
- **Dose calibration/testing**: No priming or calibration commands - need calibration and priming functionality
- **Schedule management**: No commands to read, modify, or delete existing schedules - need CRUD operations for schedules
- **Advanced scheduling**: No interval-based, countdown, or conditional dosing - need more sophisticated scheduling options

## General Features

- Need to rethink the overview display for devices. What information do we want?
- When a device is first connected to, the user needs to fill out the device 'Config' information. Device name, head names etc. They should also be made aware that the device will be 'reset' and they need to create new schedules/settings etc. So take note from controller app --> transfer.
- Device config/state/setting file needs to maintain its current state whilst allowing partial updates through command execution and/or status updates.
  - Do we need revision/previous states saved?

## Nice to haves

- Container data structure that is tracked against dosed volume —> exposed in HASSIO and WebUI
- Connecting animations/statuses should operate within the connect button to keep the user aware/updated.
- **Device Model Name Specifications**: Backend `model_name` field should include full device specifications (e.g., "WRGB II Pro 120cm" instead of "WRGB II Pro"). Current frontend properly displays whatever backend provides, but model names are truncated and missing size/variant information.
