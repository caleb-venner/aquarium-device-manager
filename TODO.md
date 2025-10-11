# Project TODO

## High Priority

### Doser Features

- Implement manual and one-time dosing commands.
- Add support for advanced schedule types (interval, countdown, conditional).
- Implement dosing pump calibration and priming functionality.
- Add full schedule management (Create, Read, Update, Delete).

### Light Features

- Investigate and implement "Custom Mode".
- Add auto, manual, and favorite settings to the device overview.
- Prevent overlapping auto mode schedules.
- Display real-time light values from saved configuration.
- Fix "Turn On" / "Turn Off" functionality in device settings.

### General & UI

- Implement a first-time setup wizard for new devices.
- Redesign the device overview page for better clarity.
- Ensure device configuration supports partial updates.
- Create virtual devices for testing different hardware configurations.

## Medium Priority

### Medium Priority Light Features

- Support 140% brightness for capable devices based on wattage calculations.
- Define the Home Assistant entity model for lights.
- Implement single-payload manual brightness setting.

### Medium Priority General & UI

- Improve connection status feedback in the UI.
- Remove the "Searching" notification when scanning for devices.
- Consider implementing versioning for device configurations.

## Low Priority / Nice to Haves

- Track dosed volume against container size and expose to UI and Home Assistant.
- Expand device model names in the backend to include full specifications (e.g., size).
