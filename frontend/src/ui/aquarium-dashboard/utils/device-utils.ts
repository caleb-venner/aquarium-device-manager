/**
 * Device-specific utilities
 */

import { getDashboardState } from "../state";

/**
 * Get the configured name for a doser head
 */
export function getDoserHeadName(deviceAddress: string, headIndex: number): string | null {
  const state = getDashboardState();
  const metadata = state.doserMetadata.find(m => m.id === deviceAddress);
  return metadata?.headNames?.[headIndex] || null;
}

/**
 * Get the lifetime total for a doser head
 */
export function getHeadLifetimeTotal(headIndex: number, deviceAddress?: string): string {
  if (!deviceAddress) return 'N/A';

  const state = getDashboardState();
  const device = state.deviceStatus?.[deviceAddress];
  const parsed = device?.parsed as any;

  if (!parsed || !parsed.lifetime_totals_tenths_ml || !Array.isArray(parsed.lifetime_totals_tenths_ml)) {
    return 'N/A';
  }

  // Convert 1-based index to 0-based for array access
  const lifetimeTotal = parsed.lifetime_totals_tenths_ml[headIndex - 1];

  if (typeof lifetimeTotal !== 'number') {
    return 'N/A';
  }

  // Convert tenths of mL to mL and format appropriately
  const totalMl = lifetimeTotal / 10;

  if (totalMl >= 1000) {
    return `${(totalMl / 1000).toFixed(2)}L`;
  }

  return `${totalMl.toFixed(1)}ml`;
}

/**
 * Format schedule days for display
 */
export function formatScheduleDays(weekdays: number[] | undefined): string {
  if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) {
    return 'None';
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const validDays = weekdays.filter(day => typeof day === 'number' && day >= 0 && day <= 6);

  if (validDays.length === 0) {
    return 'None';
  }

  const sortedDays = [...validDays].sort();

  // Check for everyday (all 7 days)
  if (sortedDays.length === 7) {
    return 'Everyday';
  }

  // Check for weekdays (Mon-Fri)
  if (sortedDays.length === 5 && sortedDays.every(day => day >= 1 && day <= 5)) {
    return 'Weekdays';
  }

  // Check for weekends (Sat-Sun)
  if (sortedDays.length === 2 && sortedDays.includes(0) && sortedDays.includes(6)) {
    return 'Weekends';
  }

  // Otherwise, list the days
  return sortedDays.map(day => dayNames[day]).join(', ');
}

/**
 * Get configuration data for a specific head
 */
export function getHeadConfigData(headIndex: number, deviceAddress: string): { setDose: string; schedule: string } {
  const state = getDashboardState();
  const savedConfig = state.doserConfigs.find(config => config.id === deviceAddress);

  if (!savedConfig || !savedConfig.configurations || savedConfig.configurations.length === 0) {
    return { setDose: 'N/A', schedule: 'N/A' };
  }

  const activeConfig = savedConfig.configurations.find(c => c.id === savedConfig.activeConfigurationId);
  if (!activeConfig || !activeConfig.revisions || activeConfig.revisions.length === 0) {
    return { setDose: 'N/A', schedule: 'N/A' };
  }

  const latestRevision = activeConfig.revisions[activeConfig.revisions.length - 1];
  const configHead = latestRevision.heads?.find((h: any) => h.index === headIndex);

  if (!configHead) {
    return { setDose: 'N/A', schedule: 'N/A' };
  }

  // Show configuration data even if head is not currently active on device
  // This ensures configured heads always display their settings
  let setDose = 'N/A';
  const schedule = configHead.schedule;
  if (schedule) {
    // Format dose amount
    if (schedule.volume_ml !== undefined && schedule.volume_ml !== null) {
      setDose = `${schedule.volume_ml}ml`;
    } else if (schedule.volume_tenths_ml !== undefined && schedule.volume_tenths_ml !== null) {
      setDose = `${schedule.volume_tenths_ml / 10}ml`;
    }

    // Format schedule days
    const scheduleText = formatScheduleDays(configHead.recurrence?.days);
    return { setDose, schedule: scheduleText };
  }

  return { setDose: 'N/A', schedule: 'N/A' };
}
