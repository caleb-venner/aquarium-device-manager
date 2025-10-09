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

## Future Improvements

### Real-Time UI Updates

- **Issue**: Frontend relies on polling for status updates, no real-time push mechanism
- **Impact**: Delayed user feedback on command execution
- **Task**: Implement WebSocket connections for real-time device state updates

**Priority Decision Tabled**: Will decide between Real-Time UI Updates vs Device Reconnection State Tracking based on user experience impact assessment.

### Test Coverage Expansion

- **Issue**: Limited integration tests for full command flows and concurrent operations
- **Impact**: Potential undetected race conditions or edge cases
- **Task**: Add integration tests with mocked BLE devices for concurrent operations and network failures

### Command Batching Optimization

- **Issue**: Commands sent individually with delays instead of optimized batching
- **Impact**: Slower response times for multi-command operations
- **Task**: Batch related commands where protocol allows

### Device Reconnection State Tracking

- **Issue**: Auto-reconnect state not properly tracked in UI
- **Impact**: UI shows stale device status during reconnection attempts
- **Task**: Add connection state indicators and retry logic in UI

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
