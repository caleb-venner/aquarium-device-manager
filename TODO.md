# Aquarium Device Controller TODO

## Incomplete Features

### Light Features

- Need to figure out the Custom Mode. I think it just creates a bunch of auto mode settings; the device itself must compute how they all interact.
- Ensure Auto settings do not overlap. One can end at 21:00 with another starting at 21:00; cannot have end 21:01 start 21:00.
- Real time light values - need to be implemented from saved config data.
- What are we exposing as devices, entities, helpers, attributes?

### Doser Features

- **Manual/One-time dosing**: No immediate dose commands - need encoder functions and device methods for manual dosing
- **Different schedule types**: Only daily recurring schedules supported - need interval-based, countdown, and conditional dosing modes
- **Dose calibration/testing**: No priming or calibration commands - need calibration and priming functionality
- **Schedule management**: No commands to read, modify, or delete existing schedules - need CRUD operations for schedules
- **Advanced scheduling**: No interval-based, countdown, or conditional dosing - need more sophisticated scheduling options

### General Features

- Device config/state/setting file needs to maintain its current state whilst allowing partial updates through command execution and/or status updates.
  - Do we need revision/previous states saved?

## Technical Debt and Improvements (From Code Assessment)

### Storage Layer Consolidation

- **Issue**: Duplicate filtering logic for `.metadata.json` files in `DoserStorage` and `LightStorage`
- **Impact**: Code duplication and inconsistent behavior
- **Task**: Extract common storage utilities into a base class or utility module
- **✅ COMPLETED**: Created `storage_utils.py` with `filter_device_json_files()` function, updated both storage classes to use it, all tests pass

### Message ID Management Enhancement

- **Issue**: Message ID generation lacks wraparound protection and session reset logic
- **Impact**: Potential ID overflow in long-running sessions
- **Task**: Add bounds checking and session reset logic to `commands.next_message_id()`
- **✅ COMPLETED**: Fixed critical bug where higher byte was incorrectly reset to 0, added input validation, session reset functions, and exhaustion detection. Added comprehensive tests covering all edge cases.

### Command Validation Improvements

- **Issue**: Limited validation for weekday masks, time values, and head indices
- **Impact**: Invalid commands could be sent to devices
- **Task**: Enhance Pydantic models with stricter field validators for all command parameters
- **✅ COMPLETED**: Added comprehensive field validators for time format/range validation, weekday combinations, head indices, sunrise/sunset ordering, and ramp time constraints. Added extensive test coverage for all validation scenarios.

### Real-Time UI Updates

- **Issue**: Frontend relies on polling for status updates, no real-time push mechanism
- **Impact**: Delayed user feedback on command execution
- **Task**: Implement WebSocket connections for real-time device state updates

### Error Handling Standardization

- **Issue**: BLE errors logged but not consistently propagated to UI
- **Impact**: Poor user experience during device failures
- **Task**: Standardize error responses and add user-friendly error messages
- **✅ COMPLETED**: Added custom exception classes, improved error categorization in CommandExecutor (BLE communication errors, validation errors, timeouts), updated API routes to properly propagate HTTPExceptions, enhanced error messages for better user experience

**Priority Decision Tabled**: Will decide between Real-Time UI Updates vs Device Reconnection State Tracking based on user experience impact assessment.

### Test Coverage Expansion

- **Issue**: Limited integration tests for full command flows and concurrent operations
- **Impact**: Potential undetected race conditions or edge cases
- **Task**: Add integration tests with mocked BLE devices for concurrent operations and network failures

### Polling Optimization

- **Issue**: Fixed polling frequency may overload devices and network
- **Impact**: Battery drain and unnecessary traffic
- **Task**: Implement adaptive polling based on device activity levels
- **✅ COMPLETED**: Disabled automatic polling by default - aquarium devices run autonomously on schedules and status rarely changes. Added manual refresh capability and optional polling controls for health monitoring if needed.

### Command Batching Optimization

- **Issue**: Commands sent individually with delays instead of optimized batching
- **Impact**: Slower response times for multi-command operations
- **Task**: Batch related commands where protocol allows

### Timezone Handling

- **Issue**: Time sync uses system time without timezone validation
- **Impact**: Incorrect dosing schedules if system timezone is misconfigured
- **Task**: Add timezone validation and user-configurable timezone support
- **Approach**: Always use system time for operations, but validate timezone and allow display timezone override
- **✅ COMPLETED**: Added system timezone detection, validation, and display timezone configuration. All device operations use system time, but UI can show times in configured display timezone.

### Device Reconnection State Tracking

- **Issue**: Auto-reconnect state not properly tracked in UI
- **Impact**: UI shows stale device status during reconnection attempts
- **Task**: Add connection state indicators and retry logic in UI


### Memory Management

- **Issue**: Device objects accumulate message ID state indefinitely
- **Impact**: Memory growth in long-running server instances
- **Task**: Add periodic cleanup or session limits for device state
- **✅ COMPLETED**: Added session-based message ID management with automatic reset after 24 hours or 1000 commands. Added configurable environment variables AQUA_MSG_ID_RESET_HOURS and AQUA_MSG_ID_MAX_COMMANDS. Added session tracking and monitoring methods.

### Multi-Device Support

- **Issue**: BLE service only allows one device per kind (one doser, one light)
- **Impact**: Cannot connect to multiple devices of same type simultaneously
- **Task**: Refactor device storage to support multiple devices per kind
- **✅ COMPLETED**: Changed data structure from Dict[str, BaseDevice] to Dict[str, Dict[str, BaseDevice]] (kind -> address -> device). Updated all methods and properties to work with multiple devices while maintaining backward compatibility. Added utility methods for device management.

## Future Enhancements

### Advanced Memory Management

- **Issue**: With multi-device support, unlimited device connections could cause memory issues
- **Impact**: Memory growth and performance degradation with many connected devices
- **Task**: Implement intelligent device cache management with size/time limits
- **Proposed Solution**:
  - Size-based limits (max 50 devices total)
  - Time-based expiration (disconnect after 2 hours idle)
  - LRU eviction for cache size management
  - Priority-based retention for critical devices
- **Status**: Ready for implementation - Phase 1 (message ID sessions) completed, Phase 2 (device cache) pending

### Command Batching

- **Issue**: Commands sent individually with delays instead of optimized batching
- **Impact**: Slower response times for multi-command operations
- **Task**: Batch related commands where protocol allows
- **Proposed Solution**:
  - Group sequential commands into single BLE operations
  - Implement command queuing and batch processing
  - Add protocol-level optimizations for related operations
- **Status**: Future enhancement - currently commands are sent individually
