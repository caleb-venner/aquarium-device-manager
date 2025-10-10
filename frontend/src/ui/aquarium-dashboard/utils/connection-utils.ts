/**
 * Connection status utilities
 */

import { getConnectionStability } from "../state";
import type { CachedStatus } from "../../../types/models";
import type { ConnectionStability } from "../types";

export type ConnectionHealth = 'stable' | 'unstable' | 'disconnected' | 'reconnecting';

/**
 * Determine overall connection health based on device status and stability tracking
 */
export function getConnectionHealth(deviceStatus: CachedStatus | null, deviceAddress: string): ConnectionHealth {
  if (!deviceStatus) {
    return 'disconnected';
  }

  // If device is not connected according to status
  if (!deviceStatus.connected) {
    return 'disconnected';
  }

  const stability = getConnectionStability(deviceAddress);

  // If we're tracking connection issues
  if (!stability.isStable) {
    // If last disconnect was recent (within 2 minutes), consider unstable
    if (stability.lastDisconnectTime && (Date.now() - stability.lastDisconnectTime) < 120000) {
      return 'unstable';
    }

    // If multiple consecutive failures, consider unstable
    if (stability.consecutiveFailures > 2) {
      return 'unstable';
    }
  }

  return 'stable';
}

/**
 * Get connection status display information
 */
export function getConnectionStatusDisplay(health: ConnectionHealth): {
  color: string;
  title: string;
} {
  switch (health) {
    case 'stable':
      return {
        color: '#10b981', // green-500 - matches typical "on" button color
        title: 'Stable'
      };
    case 'unstable':
      return {
        color: '#f59e0b', // amber-500 - warning orange
        title: 'Unstable'
      };
    case 'disconnected':
      return {
        color: '#ef4444', // red-500 - matches typical "off" button color
        title: 'Disconnected'
      };
    case 'reconnecting':
      return {
        color: '#3b82f6', // blue-500 - reconnecting state
        title: 'Reconnecting'
      };
  }
}

/**
 * Render connection status badge
 */
export function renderConnectionStatus(deviceStatus: CachedStatus | null, deviceAddress: string): string {
  const health = getConnectionHealth(deviceStatus, deviceAddress);
  const display = getConnectionStatusDisplay(health);

  return `
    <div class="connection-indicator" title="${display.title}" style="
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: ${display.color};
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      cursor: help;
    "></div>
  `;
}

/**
 * Render larger connection status for modals (inline with close button)
 */
export function renderModalConnectionStatus(deviceStatus: CachedStatus | null, deviceAddress: string): string {
  const health = getConnectionHealth(deviceStatus, deviceAddress);
  const display = getConnectionStatusDisplay(health);

  return `
    <div class="connection-indicator-modal" title="${display.title}" style="
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: ${display.color};
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      cursor: help;
    "></div>
  `;
}

/**
 * Get user-friendly message for connection issues
 */
export function getConnectionMessage(health: ConnectionHealth, deviceAddress: string): string | null {
  const stability = getConnectionStability(deviceAddress);

  switch (health) {
    case 'unstable':
      const failures = stability.consecutiveFailures;
      const lastDisconnect = stability.lastDisconnectTime;

      if (failures > 2) {
        return `This device has experienced ${failures} recent connection failures. Commands may be slow or fail.`;
      }

      if (lastDisconnect && (Date.now() - lastDisconnect) < 60000) {
        return 'This device recently disconnected and may be experiencing BLE connectivity issues.';
      }

      return 'This device is experiencing connection instability. Try moving closer or reducing interference.';

    case 'disconnected':
      return 'This device is not connected. Try refreshing or reconnecting the device.';

    default:
      return null;
  }
}
