/**
 * Dashboard rendering utilities
 */

import { getDashboardState } from "../state";

/**
 * Get human-readable time ago string
 */
export function getTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000; // Convert to seconds
  const diff = now - timestamp;

  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Get weekday name from number (0=Sunday, 1=Monday, etc.)
 */
export function getWeekdayName(weekday: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[weekday] || 'Unknown';
}

/**
 * Format time and weekday into a readable format like "2:42 PM Wednesday"
 */
export function formatDateTime(hour: number, minute: number, weekday: number): string {
  // Convert 24-hour to 12-hour format
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const timeStr = `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;

  const weekdayName = getWeekdayName(weekday);
  return `${timeStr} ${weekdayName}`;
}

/**
 * Format datetime string for display
 */
export function formatDateTimeString(isoString: string | undefined): string {
  if (!isoString) return 'Never';

  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return 'Invalid date';
  }
}

/**
 * Get the configured name for a device, falling back to model name
 */
export function getDeviceDisplayName(deviceAddress: string): string {
  const state = getDashboardState();
  const device = state.deviceStatus?.[deviceAddress];

  if (!device) return 'Unknown Device';

  // First, check if there's a configured name in metadata
  if (device.device_type === "doser") {
    const metadata = state.doserMetadata.find(m => m.id === deviceAddress);
    if (metadata?.name) return metadata.name;
  } else if (device.device_type === "light") {
    const metadata = state.lightMetadata.find(m => m.id === deviceAddress);
    if (metadata?.name) return metadata.name;
  }

  // Fall back to model name or generic name
  return device.model_name || "Unknown Device";
}

/**
 * Get channel names for a device based on its model
 */
export function getDeviceChannelNames(deviceAddress: string): string[] {
  const state = getDashboardState();
  const device = state.deviceStatus?.[deviceAddress];

  if (!device) return ['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4'];

  const modelName = device.model_name?.toLowerCase() || '';

  // WRGB devices have Red, Green, Blue, White channels
  if (modelName.includes('wrgb')) {
    return ['Red', 'Green', 'Blue', 'White'];
  }

  // RGB devices
  if (modelName.includes('rgb')) {
    return ['Red', 'Green', 'Blue', 'Channel 4'];
  }

  // Default fallback
  return ['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4'];
}
