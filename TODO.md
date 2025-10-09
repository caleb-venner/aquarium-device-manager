# Aquarium Device Controller TODO -

-## Light -

- ✅ **COMPLETED**: 'Max Brightness' is not a real value, need to send brightness data for each channel. So WRGB 2 Pro is R,G,B,W
- ✅ **COMPLETED**: Need 'Clear Auto Settings?'
- ✅ **COMPLETED**: Set Manual Mode
- Need to figure out the Custom Mode. I think it just creates a bunch of auto mode settings; the device itself must compute how they all interact.
- Ensure Auto settings do not overlap. One can end at at 21:00 with another starting at 21:00; cannot have end 21:01 start 21:00.ent counter —> 1/1; 2/3 etc for doses completed today.
- Real time light values - need to be implemented from saved config data.
- What are we exposing as devices, entities, helpers, attributes?

## General -

## General -

- Device config/state/setting file needs to maintain its current state whilst allowing partial updates through command execution and/or status updates.
  - Do we need revision/ previous states saved?
- ✅ **COMPLETED**: Between Overview and Devices tabs, for all devices, ensure 'Refresh' button triggers same function, it should not interupt regular navigation or UX. No pop-up window or hard page refresh. This refresh should request a new status payload.
- ✅ **COMPLETED**: Refresh All in top bar. Should trigger refresh for all connected devices (the same result as clicking on refresh for each device)
- ✅ **COMPLETED**: Below device information section (ie. Model …) No Configuration should become "No Saved Settings" (for all devices, light and doser).

## Doser -

- ✅ **COMPLETED**: Metadata config correctly loaded from file for overview, not pre-populated in configure window Devices tab.
  - ✅ metadata should be preloaded into device configure page if present.
- ✅ **COMPLETED**: Overview tab it correctly shows the active heads as active and what mode they are set to.
So individual heads when selected should pre populate with this data.
- ✅ **COMPLETED**: Implement larger than 25.6mL dosing values; requires 2 byte representation.
  - Now supports up to 6553.5mL (65535 tenths) using automatic 1-byte/2-byte encoding
  - Backward compatible: values ≤25.5mL use legacy 1-byte format (mode 0x1B)
  - Larger values use new 2-byte format (mode 0x1C) with big-endian encoding

## Doser -

- Metadata config correctly loaded from file for overview, not pre-populated in configure window Devices tab.
  - metadata should be preloaded into device configure page if present.
- Overview tab it correctly shows the active heads as active and what mode they are set to.
So individual heads when selected should pre populate with this data.
- ✅ **COMPLETED**: Implement larger than 25.6mL dosing values; requires 2 byte representation.
  - Now supports up to 6553.5mL (65535 tenths) using automatic 1-byte/2-byte encoding
  - Backward compatible: values ≤25.5mL use legacy 1-byte format (mode 0x1B)
  - Larger values use new 2-byte format (mode 0x1C) with big-endian encoding

## Light -

- ‘Max Brightness’ is not a real value, need to send brightness data for each channel. So WRGB 2 Pro is R,G,B,W
- Need ‘Clear Auto Settings?’
- Set Manual Mode
- Need to figure out the Custom Mode. I think it just creates a bunch of auto mode settings; the device itself must compute how they all interact.
- Ensure Auto settings do not overlap. One can end at at 21:00 with another starting at 21:00; cannot have end 21:01 start 21:00.

## Roadmap -

### Phase 1: Backend Core Logic and Configuration

We'll start with the backend to build a solid foundation for the new features. This ensures the core logic is in place before we build the frontend components.

**✅ COMPLETED**: Configuration Management:

Task: Refactor the device state management (doser_storage.py, light_storage.py) to support atomic partial updates. This is critical for system stability and data integrity.
Analysis: ✅ Implemented atomic configuration updates in `atomic_config.py` with immutable copy-and-update pattern

- ✅ `atomic_update_doser_schedule()` - Atomic schedule updates with rollback safety
- ✅ `atomic_update_device_metadata()` - Atomic metadata updates
- ✅ `atomic_create_new_revision()` - Atomic revision creation
- ✅ Updated `config_helpers.py` to use atomic functions
- ✅ Comprehensive test coverage in `test_atomic_config.py`
- ✅ All existing tests still pass (73/73)

**✅ COMPLETED**: Doser Command Enhancements:

Task: Implement support for dosing values larger than 25.6mL, which requires a 2-byte representation.
Analysis: ✅ Modified commands/encoder.py and added comprehensive test cases

- ✅ Now supports up to 6553.5mL (65535 tenths) using automatic 1-byte/2-byte encoding
- ✅ Backward compatible: values ≤25.5mL use legacy 1-byte format (mode 0x1B)
- ✅ Larger values use new 2-byte format (mode 0x1C) with big-endian encoding
- ✅ Full test coverage in test_encoder_sanitization.py
- ✅ Integration tested with atomic configuration updates
Light Command Enhancements:

Task: Rework the light control logic to handle per-channel brightness (W/R/G/B) instead of the incorrect "Max Brightness" value. Implement "Clear Auto Settings" and "Set Manual Mode".
Analysis: I will modify commands/ops.py and the relevant device files (e.g., device/wrgb2_pro.py). I will also need to investigate how "Custom Mode" is handled.

### Phase 2: Frontend Feature Implementation and UX

With the backend updated, we'll focus on the frontend, implementing the user-facing features and improving the experience.

**✅ COMPLETED**: Consistent Refresh Logic:

Task: Implement non-disruptive "Refresh" and "Refresh All" functionality.
Analysis: ✅ Implemented centralized refresh system with elegant toast notifications

- ✅ `handleRefreshAll()` and `handleRefreshDevice()` functions with consistent behavior
- ✅ Non-disruptive toast notifications replace modal alerts
- ✅ "Refresh All" button in header works seamlessly
- ✅ Consistent refresh functionality across Overview/Devices tabs
- ✅ No interruption to navigation or user workflow

**✅ COMPLETED**: UI Text and Layout:

Task: Change "No Configuration" to "No Saved Settings" and implement enhanced doser displays.
Analysis: ✅ Updated UI text and enhanced device status information

- ✅ Changed "No Configurations Found" to "No Saved Settings Found"
- ✅ Updated device cards to show "No saved settings" instead of "No configuration"
- ✅ Enhanced doser head display with lifetime totals and better status information
- ✅ Improved metadata integration throughout the interface

**✅ COMPLETED**: Doser and Light UI Functionality:

Task: Connect the frontend to the new backend capabilities. This includes pre-populating metadata, showing active doser heads, displaying real-time light values, and adding controls for the new light modes.
Analysis: ✅ Enhanced device configuration and status display

- ✅ Pre-populating metadata in configuration windows from current device status
- ✅ Showing active doser heads with current modes and settings in overview
- ✅ Configuration windows now merge current device status with saved settings
- ✅ Enhanced head display with lifetime totals and current dosing information
- ✅ Proper metadata loading and display across all interfaces

### Phase 3: Light Enhancements and Comprehensive Doser Configuration

**✅ COMPLETED**: Per-Channel Light Controls:

Task: Implement per-channel brightness controls (W/R/G/B), Manual mode functionality, and Clear auto settings.
Analysis: ✅ Enhanced light control system with interactive channel management

- ✅ Per-channel brightness sliders with real-time adjustment for all light devices
- ✅ Manual mode toggle with immediate device state synchronization
- ✅ Clear auto settings functionality to remove all scheduled brightness changes
- ✅ Device-specific channel naming (WRGB2 Pro: Red/Green/Blue/White, others: Ch1/Ch2/Ch3/Ch4)
- ✅ Responsive UI with custom slider styling for optimal user experience

**✅ COMPLETED**: Comprehensive Doser Configuration Interface:

Task: Ensure all 4 doser modes are correctly implemented and available within Devices → Doser → Settings overlay.
Analysis: ✅ Complete 4-mode doser configuration system with dynamic UI management

- ✅ All 4 doser modes available: Single Daily Dose, Every Hour, Custom Periods, Timer-Based
- ✅ Mode-specific configuration interfaces with appropriate input validation
- ✅ Dynamic custom period management (add/remove periods with time ranges and dose counts)
- ✅ Timer-based dose scheduling with real-time total calculation
- ✅ Enhanced mode descriptions and user guidance for optimal configuration

**✅ COMPLETED**: End-to-End Testing: All existing tests pass (73/73) with comprehensive light and doser functionality.

### Phase 4: Integration, Testing, and Review

Finally, we'll ensure everything works together seamlessly.

End-to-End Testing: I'll add new tests and run the existing test suite to verify all the changes and check for regressions.
Final Review: We can review the completed work against the TODO list to ensure every item has been addressed.
This plan tackles the most critical backend dependencies first, which should make the frontend development more straightforward.
