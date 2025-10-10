/**
 * Device card rendering functions
 */

import { getDashboardState } from "../state";
import { getDeviceDisplayName, getTimeAgo } from "../utils/rendering-utils";
import { renderConnectionStatus } from "../utils/connection-utils";
import { renderLightCardStatus, renderChannelLevels } from "./light-components";
import { renderDoserCardStatus } from "./doser-components";
import type { CachedStatus } from "../../../types/models";

/**
 * Render a device section with device tiles
 */
export function renderDeviceSection(
  title: string,
  devices: Array<CachedStatus & { address: string }>
): string {
  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${title}</h2>
        <div class="badge badge-info">${devices.length}</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-top: 16px;">
        ${devices.map(device => renderDeviceTile(device)).join("")}
      </div>
    </div>
  `;
}

/**
 * Render an individual device tile with full device info
 */
function renderDeviceTile(device: CachedStatus & { address: string }): string {
  const statusColor = device.connected ? "var(--success)" : "var(--gray-400)";
  const statusText = device.connected ? "Connected" : "Disconnected";
  const deviceName = getDeviceDisplayName(device.address);
  const timeAgo = getTimeAgo(device.updated_at);

  return `
    <div class="card device-card ${device.device_type} ${device.connected ? 'connected' : 'disconnected'}" style="padding: 0; border-left: 4px solid ${statusColor};">
      ${renderDeviceCardHeader(device, deviceName, statusText, timeAgo)}
      ${device.parsed && device.connected ? renderDeviceCardStatus(device) : renderNoDataStatus()}
      ${renderDeviceCardControls(device)}
    </div>
  `;
}

/**
 * Render device card header
 */
function renderDeviceCardHeader(
  device: CachedStatus & { address: string },
  deviceName: string,
  statusText: string,
  timeAgo: string
): string {
  const connectionStatus = renderConnectionStatus(device, device.address);

  return `
    <div class="device-header" style="padding: 16px; border-bottom: 1px solid var(--gray-200); position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <div style="flex: 1; padding-right: 24px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <h3 style="font-size: 18px; font-weight: 600; margin: 0; color: var(--gray-900);">
              ${deviceName}
            </h3>
          </div>
          <div style="font-size: 12px; font-family: monospace; color: var(--gray-600);">
            ${device.address}
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          ${connectionStatus}
          <div style="font-size: 11px; color: var(--gray-500);">${timeAgo}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render device status section based on device type
 */
function renderDeviceCardStatus(device: CachedStatus & { address: string }): string {
  if (device.device_type === "light") {
    return renderLightCardStatus(device);
  } else if (device.device_type === "doser") {
    return renderDoserCardStatus(device);
  }
  return renderNoDataStatus();
}

/**
 * Render "no data" message
 */
function renderNoDataStatus(): string {
  return `
    <div style="padding: 24px; text-align: center; color: var(--gray-500); font-size: 14px;">
      No status data available
    </div>
  `;
}

/**
 * Render device control buttons
 */
function renderDeviceCardControls(device: CachedStatus & { address: string }): string {
  const state = getDashboardState();
  const deviceType = device.device_type;

  // Check if device has a configuration
  let hasConfig = false;
  if (deviceType === 'doser') {
    hasConfig = state.doserConfigs.some(config => config.id === device.address);
  } else if (deviceType === 'light') {
    hasConfig = state.lightConfigs.some(config => config.id === device.address);
  }

  return `
    <div style="padding: 16px; border-top: 1px solid var(--gray-200); background: white;">
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <button class="btn btn-sm btn-outline" onclick="window.showDeviceConfigModal('${device.address}')" style="flex: 1; min-width: 80px;" title="Device Configuration">
          ⚙️ Configure
        </button>
        ${device.connected ? `
          <button class="btn btn-sm btn-secondary" onclick="window.handleDeviceSettings('${device.address}', '${deviceType}')" style="flex: 1; min-width: 80px;" title="Device Commands & Controls">
            <span>🔧</span> Controls
          </button>
          <button class="btn btn-sm btn-secondary" style="flex: 1; min-width: 80px;">
            🔄 Refresh
          </button>
        ` : `
          <button class="btn btn-sm ${device.connected ? 'btn-warning' : 'btn-primary'}" style="flex: 1; min-width: 100px;">
            ${device.connected ? '🔌 Disconnect' : '🔗 Connect'}
          </button>
        `}
      </div>
    </div>
  `;
}
