/**
 * Doser device rendering components
 */

import { getDashboardState } from "../state";
import { formatDateTime, getWeekdayName } from "../utils/rendering-utils";
import { getDoserHeadName, getHeadLifetimeTotal, getHeadConfigData } from "../utils/device-utils";
import type { CachedStatus } from "../../../types/models";

/**
 * Render doser device status
 */
export function renderDoserCardStatus(device: CachedStatus & { address: string }): string {
  const parsed = device.parsed as any; // DoserParsed type
  if (!parsed) {
    return `
      <div style="padding: 24px; text-align: center; color: var(--gray-500); font-size: 14px;">
        No parsed data available
      </div>
    `;
  }

  const currentTime = parsed.hour !== null && parsed.minute !== null
    ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
    : 'Unknown';

  const weekdayName = parsed.weekday !== null ? getWeekdayName(parsed.weekday) : 'Unknown';

  // Create combined date/time display
  const dateTimeDisplay = currentTime !== 'Unknown' && weekdayName !== 'Unknown'
    ? formatDateTime(parsed.hour, parsed.minute, parsed.weekday)
    : 'Unknown';

  const heads = parsed.heads || [];

  // Count active heads: status != 4 (Disabled)
  // Head status: {0,1,2,3,4} = {Daily, 24 Hourly, Custom, Timer, Disabled}
  const activeHeads = heads.filter((head: any) => head.mode !== 4).length;

  // Find the saved configuration for this device
  const state = getDashboardState();
  const savedConfig = state.doserConfigs.find(config => config.id === device.address);

  return `
    <div style="padding: 16px; background: var(--gray-50);">
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Time</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--gray-900);">${dateTimeDisplay}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Active Heads</div>
          <div style="font-size: 20px; font-weight: 700, color: var(--primary);">${activeHeads}/${heads.length}</div>
        </div>
      </div>
      ${renderPumpHeads(heads, savedConfig, device.address)}
    </div>
  `;
}

/**
 * Render pump heads grid
 */
function renderPumpHeads(heads: any[], savedConfig?: any, deviceAddress?: string): string {
  // Always show 4 heads (standard for doser devices)
  // Combine device status data with configuration data
  const allHeads = [];

  for (let i = 0; i < 4; i++) {
    const deviceHead = heads[i];
    const headIndex = i + 1; // 1-based indexing for heads

    // Get configuration data for this head
    const configData = deviceAddress ? getHeadConfigData(headIndex, deviceAddress) : { setDose: 'N/A', schedule: 'N/A' };

    // Get custom head name from metadata
    const customName = deviceAddress ? getDoserHeadName(deviceAddress, i) : null;

    // Get lifetime total
    const lifetimeTotal = deviceAddress ? getHeadLifetimeTotal(headIndex, deviceAddress) : 'N/A';

    allHeads.push({
      index: headIndex,
      deviceHead,
      configData,
      customName,
      lifetimeTotal
    });
  }

  return `
    <div style="background: white; padding: 16px; border-radius: 6px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 12px;">Pump Heads</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        ${allHeads.map((head: any) => renderPumpHead(head)).join('')}
      </div>
    </div>
  `;
}

/**
 * Render a single pump head
 */
function renderPumpHead(head: any): string {
  const { index, deviceHead, configData, customName, lifetimeTotal } = head;

  // Determine head status and mode
  let statusText = 'Disabled';
  let statusColor = 'var(--gray-400)';
  let modeText = 'N/A';

  if (deviceHead) {
    // Head status: {0,1,2,3,4} = {Daily, 24 Hourly, Custom, Timer, Disabled}
    const mode = deviceHead.mode;
    switch (mode) {
      case 0:
        statusText = 'Active';
        statusColor = 'var(--success)';
        modeText = 'Daily';
        break;
      case 1:
        statusText = 'Active';
        statusColor = 'var(--success)';
        modeText = '24H';
        break;
      case 2:
        statusText = 'Active';
        statusColor = 'var(--success)';
        modeText = 'Custom';
        break;
      case 3:
        statusText = 'Active';
        statusColor = 'var(--success)';
        modeText = 'Timer';
        break;
      case 4:
      default:
        statusText = 'Disabled';
        statusColor = 'var(--gray-400)';
        modeText = 'Disabled';
        break;
    }
  }

  const headName = customName || `Head ${index}`;

  return `
    <div style="background: var(--gray-50); padding: 12px; border-radius: 6px; border-left: 3px solid ${statusColor};">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--gray-900); margin-bottom: 2px;">${headName}</div>
          <div style="font-size: 11px; color: var(--gray-500);">${modeText}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; color: ${statusColor}; font-weight: 600;">${statusText}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
        <div>
          <div style="color: var(--gray-500); margin-bottom: 2px;">Set Dose</div>
          <div style="font-weight: 600; color: var(--gray-900);">${configData.setDose}</div>
        </div>
        <div>
          <div style="color: var(--gray-500); margin-bottom: 2px;">Lifetime</div>
          <div style="font-weight: 600; color: var(--gray-900);">${lifetimeTotal}</div>
        </div>
      </div>

      <div style="margin-top: 8px;">
        <div style="font-size: 10px; color: var(--gray-500); margin-bottom: 2px;">Schedule</div>
        <div style="font-size: 11px; font-weight: 600; color: var(--gray-700);">${configData.schedule}</div>
      </div>
    </div>
  `;
}
