/**
 * Type converters between API types and Domain types
 */

import type { DoserDevice as ApiDoserDevice, LightDevice as ApiLightDevice } from "../../../api/configurations";
import type { DoserDevice as DomainDoserDevice, LightDevice as DomainLightDevice } from "../../../types/models";

/**
 * Convert API DoserDevice to Domain DoserDevice for UI components
 */
export function apiToDoserDevice(apiDevice: ApiDoserDevice): DomainDoserDevice {
  // For now, create a mock conversion since the API device doesn't have heads directly
  // In a real scenario, you'd extract heads from the configurations
  return {
    id: apiDevice.id,
    name: apiDevice.name,
    timezone: apiDevice.timezone,
    heads: [
      // Mock heads - in reality, these would be extracted from configurations
      {
        index: 1 as const,
        label: "Head 1",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      },
      {
        index: 2 as const,
        label: "Head 2",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      },
      {
        index: 3 as const,
        label: "Head 3",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      },
      {
        index: 4 as const,
        label: "Head 4",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      }
    ],
    createdAt: apiDevice.createdAt,
    updatedAt: apiDevice.updatedAt
  };
}

/**
 * Convert API LightDevice to Domain LightDevice for UI components
 */
export function apiToLightDevice(apiDevice: ApiLightDevice): DomainLightDevice {
  return {
    id: apiDevice.id,
    name: apiDevice.name,
    timezone: apiDevice.timezone,
    channels: apiDevice.channels.map(ch => ({
      key: ch.key,
      label: ch.label,
      min: ch.min,
      max: ch.max,
      step: ch.step
    })),
    profile: {
      mode: 'manual' as const,
      levels: {} // Default empty levels
    },
    createdAt: apiDevice.createdAt,
    updatedAt: apiDevice.updatedAt
  };
}

/**
 * Create a default domain DoserDevice for new devices
 */
export function createDefaultDoserDevice(address: string, name?: string): DomainDoserDevice {
  return {
    id: address,
    name: name || `Doser ${address.slice(-8)}`,
    timezone: 'UTC',
    heads: [
      {
        index: 1 as const,
        label: "Head 1",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      },
      {
        index: 2 as const,
        label: "Head 2",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      },
      {
        index: 3 as const,
        label: "Head 3",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      },
      {
        index: 4 as const,
        label: "Head 4",
        active: false,
        schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
        recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        missedDoseCompensation: false,
        calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
      }
    ]
  };
}

/**
 * Create a default domain LightDevice for new devices
 */
export function createDefaultLightDevice(address: string, name?: string): DomainLightDevice {
  return {
    id: address,
    name: name || `Light ${address.slice(-8)}`,
    timezone: 'UTC',
    channels: [
      { key: 'R', label: 'Red', min: 0, max: 100, step: 1 },
      { key: 'G', label: 'Green', min: 0, max: 100, step: 1 },
      { key: 'B', label: 'Blue', min: 0, max: 100, step: 1 },
      { key: 'W', label: 'White', min: 0, max: 100, step: 1 }
    ],
    profile: {
      mode: 'manual' as const,
      levels: { R: 0, G: 0, B: 0, W: 0 }
    }
  };
}
