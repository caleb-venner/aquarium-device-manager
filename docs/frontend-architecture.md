# Frontend Architecture Documentation

## Overview

This document covers the frontend architecture evolution from a legacy dashboard to a modern, state-managed SPA system. The frontend is built with TypeScript, Vite, and Zustand for state management.

## Architecture Components

### Core Systems

1. **Modern Dashboard** (`ui/modernDashboard.ts`)
   - Complete dashboard view with device cards
   - Real-time status updates via background polling
   - Global status indicators and error handling
   - Device grouping by type (lights vs dosers)
   - Scan and connect functionality

2. **Enhanced Device Cards** (`ui/modernDeviceCard.ts`)
   - Rich device information display
   - Connection status badges with visual indicators
   - Device-specific status information (brightness charts, doser heads)
   - Quick action controls (on/off, refresh, connect/disconnect)
   - Loading states and error display

3. **State Management** (`stores/deviceStore.ts`)
   - Zustand-based centralized state management
   - Device state management with loading/error states
   - Command queue with automatic processing
   - UI state management (current view, notifications, etc.)
   - Comprehensive action creators for all operations

### API Layer

The API layer is structured into focused modules:

- **HTTP utilities** (`api/http.ts`): fetchJson, postJson, putJson, deleteJson
- **Command system** (`api/commands.ts`): executeCommand, getCommandHistory, getCommand
- **Device management** (`api/devices.ts`): scanDevices, connectDevice, refreshDeviceStatus
- **Legacy endpoints** (`api/legacy.ts`): Backwards compatibility for existing code

### Type System

Comprehensive TypeScript interfaces in `types/models.ts`:

- **Backend model interfaces**: CommandRecord, CachedStatus, parsed device states
- **API response interfaces**: StatusResponse, LiveStatusResponse, ScanDevice
- **Command argument interfaces**: SetBrightnessArgs, AddAutoSettingArgs, SetScheduleArgs
- **UI state interfaces**: DeviceState, QueuedCommand, UIState, Notification
- **Type guards and utilities**: Type-safe device checking, command status helpers

## Application Structure

### Multi-Entry Point System

The frontend supports multiple entry points for different use cases:

```
frontend/
├── index.html              # Legacy dashboard entry
├── modern.html             # Modern dashboard entry
├── compare.html            # Dashboard comparison page
├── dev.html               # Developer tools
├── test-tools.html        # Testing utilities
├── src/
│   ├── main.ts            # Legacy dashboard main
│   ├── modernMain.ts      # Modern dashboard main
│   ├── debugMain.ts       # Debug tools main
│   ├── testToolsMain.ts   # Test tools main
│   ├── ui/                # UI components
│   ├── stores/            # State management
│   ├── api/               # API layer
│   └── types/             # TypeScript definitions
```

### Features

#### Real-time Updates
- **Intelligent Polling System** (`ui/polling.ts`)
  - Adaptive refresh rates based on user activity
  - Fast (5s), Normal (15s), Slow (60s), Error (30s) modes
  - Automatic mode switching based on user interaction
  - Error handling with backoff strategies

#### State Subscriptions
- **State Subscription System** (`ui/stateSubscriptions.ts`)
  - Automatic UI updates when store state changes
  - Throttled re-renders to prevent performance issues
  - Selective updates based on what actually changed

#### Notifications
- **Visual notification component** (`ui/notifications.ts`)
  - Toast-style notifications with auto-hide
  - Type-based styling (info, success, warning, error)
  - Time-based display with auto-updating timestamps
  - Smooth animations and user interaction

## API Endpoint Mapping

### Device Management
- `GET /api/status` → Dashboard data (cached statuses)
- `POST /api/debug/live-status` → Overview data (live capture)
- `GET /api/scan` → Device discovery
- `POST /api/devices/{address}/connect` → Connect to device
- `POST /api/devices/{address}/disconnect` → Disconnect device
- `POST /api/devices/{address}/status` → Refresh device status

### Command System (Unified)
- `POST /api/devices/{address}/commands` → Execute any command
- `GET /api/devices/{address}/commands` → Command history
- `GET /api/devices/{address}/commands/{id}` → Single command details

### Legacy Endpoints (maintained for compatibility)
- Light controls: `/api/lights/{address}/*`
- Doser controls: `/api/dosers/{address}/*`

## Usage Examples

### Basic State Management

```typescript
import { useDevices, useActions, useLightDevices, useDoserDevices } from "../stores/deviceStore";

export function DeviceDashboard() {
  const devices = useDevices();
  const lightDevices = useLightDevices();
  const doserDevices = useDoserDevices();
  const { refreshDevices, queueCommand } = useActions();

  // Refresh all devices
  const handleRefresh = async () => {
    await refreshDevices();
  };

  // Control device
  const handleDeviceControl = (address: string, command: CommandRequest) => {
    queueCommand(address, command);
  };
}
```

### Command Execution

```typescript
import { executeCommand } from "../api/commands";
import type { SetBrightnessArgs } from "../types/models";

// Execute brightness command
const setBrightness = async (address: string, channels: SetBrightnessArgs) => {
  const command = await executeCommand(address, {
    command: "set_brightness",
    args: channels
  });

  console.log(`Command ${command.id} executed with status: ${command.status}`);
};
```

## Migration from Legacy

The architecture maintains full backwards compatibility while providing modern features:

1. **Legacy Dashboard**: Continues to work unchanged at `/`
2. **Modern Dashboard**: Available at `/modern.html` with enhanced features
3. **Shared APIs**: Both dashboards use the same backend endpoints
4. **Gradual Migration**: Components can be migrated individually

## Build Configuration

The project uses Vite with multi-entry configuration:

```typescript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        modern: resolve(__dirname, 'modern.html'),
        dev: resolve(__dirname, 'dev.html'),
        testTools: resolve(__dirname, 'test-tools.html'),
        // ... other entry points
      }
    }
  }
}
```

This allows for independent deployment and testing of different interface versions while maintaining a unified codebase.
