/**
 * Devices tab rendering
 */

import { getDashboardState } from "../state";
import { formatDateTimeString, getDeviceDisplayName } from "../utils/rendering-utils";
import { renderConnectionStatus } from "../utils/connection-utils";

/**
 * Render the unified devices tab - shows all connected devices with their configurations
 */
export function renderDevicesTab(): string {
  const state = getDashboardState();

  // Get all connected devices from device status
  const connectedDevices = state.deviceStatus ? Object.entries(state.deviceStatus) : [];

  if (connectedDevices.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🏠</div>
        <h2>No Devices Connected</h2>
        <p>Connect your aquarium devices to monitor and control them from this dashboard.</p>
        <div class="empty-state-actions">
          <p class="text-muted">
            <span class="icon">🔍</span> Use the "Scan" button in the top bar to discover devices
          </p>
          <p class="text-muted">
            <span class="icon">📱</span> Make sure your devices are powered on and in pairing mode
          </p>
        </div>
      </div>
    `;
  }

  const totalDevices = connectedDevices.length;
  const devicesWithConfigs = connectedDevices.filter(([address, status]) => {
    const deviceType = status.device_type;
    if (deviceType === 'doser') {
      return state.doserConfigs.some(config => config.id === address);
    } else if (deviceType === 'light') {
      return state.lightConfigs.some(config => config.id === address);
    }
    return false;
  }).length;

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Connected Devices</h2>
        <div class="header-badges">
          <div class="badge badge-info">${totalDevices} Connected</div>
          <div class="badge badge-success">${devicesWithConfigs} Configured</div>
        </div>
      </div>
    </div>
    <div class="config-grid">
      ${connectedDevices.map(([address, status]) => renderConnectedDeviceCard(address, status)).join("")}
    </div>
  `;
}

/**
 * Render a card for any connected device (with or without configuration)
 */
function renderConnectedDeviceCard(address: string, status: any): string {
  const state = getDashboardState();
  const deviceType = status.device_type;
  const displayName = getDeviceDisplayName(address);
  const modelName = status.model_name || 'Unknown Model';
  const isConnected = status.connected;
  const lastUpdated = new Date(status.updated_at * 1000);

  // Check if device has a configuration
  let hasConfig = false;
  let configCount = 0;
  let deviceConfig: any = null;

  if (deviceType === 'doser') {
    deviceConfig = state.doserConfigs.find(config => config.id === address);
    hasConfig = !!deviceConfig;
    configCount = deviceConfig?.configurations?.length || 0;
  } else if (deviceType === 'light') {
    deviceConfig = state.lightConfigs.find(config => config.id === address);
    hasConfig = !!deviceConfig;
    configCount = deviceConfig?.configurations?.length || 0;
  }

  const formatDateTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
  };

  return `
    <div class="card ${isConnected ? 'device-connected' : 'device-disconnected'}">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
          ${renderConnectionStatus(status, address)}
          ${deviceConfig?.name || displayName}
        </h3>
        <div class="card-actions">
          <button class="btn-icon" title="Device Configuration (Name, Head Names, Auto-Connect)" onclick="window.showDeviceConfigModal('${address}')">Configure</button>
          ${hasConfig ? `<button class="btn-icon" title="Delete Profile" onclick="window.handleDeleteDevice('${address}', '${deviceType}')">Delete</button>` : ''}
        </div>
      </div>

      <!-- Device Info Section -->
      <div class="device-info-section">
        <div class="device-detail">
          <div class="detail-label">Device Address</div>
          <div class="detail-value">${address}</div>
        </div>
        <div class="device-detail">
          <div class="detail-label">Type</div>
          <div class="detail-value">${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}</div>
        </div>
        <div class="device-detail">
          <div class="detail-label">Model</div>
          <div class="detail-value">${modelName}</div>
        </div>
      </div>

      <!-- Connection Status -->
      <div class="connection-status">
        <div class="status-indicator ${isConnected ? 'connected' : 'disconnected'}">
          <span class="status-dot"></span>
          ${isConnected ? 'Connected' : 'Disconnected'}
        </div>
        <div class="last-updated">
          Last updated: ${formatDateTime(lastUpdated)}
        </div>
      </div>

      <!-- Configuration Status -->
      <div class="config-status">
        <div class="badge ${hasConfig ? 'badge-success' : 'badge-gray'}">
          ${hasConfig ? `${configCount} configuration${configCount !== 1 ? 's' : ''}` : 'No saved settings'}
        </div>
        ${hasConfig && deviceConfig && 'activeConfigurationId' in deviceConfig ? `
          <div class="active-config">
            Active: ${deviceConfig.activeConfigurationId || 'None'}
          </div>
        ` : ''}
      </div>

      <!-- Device-Specific Info -->
      ${deviceType === 'doser' && status.parsed ? renderDoserStatusInfo(status.parsed) : ''}
      ${deviceType === 'light' && status.parsed ? renderLightStatusInfo(status.parsed) : ''}

      <!-- Quick Actions -->
      <div class="device-actions">
        ${isConnected ? `
          <button class="btn btn-secondary btn-small" title="Device Commands & Schedule Settings" onclick="window.handleDeviceSettings('${address}', '${deviceType}')">
            <span>⚙️</span>
            Settings
          </button>
          <button class="btn btn-secondary btn-small" onclick="window.handleRefreshDevice('${address}')">
            <span>🔄</span>
            Refresh
          </button>
        ` : `
          <button class="btn btn-primary btn-small" onclick="window.handleConnectDevice('${address}')">
            <span>🔌</span>
            Connect
          </button>
        `}
      </div>
    </div>
  `;
}

/**
 * Render doser-specific status information
 */
function renderDoserStatusInfo(parsed: any): string {
  if (!parsed || !parsed.heads) return '';

  // Count active heads: status != 4 (Disabled)
  // Head status: {0,1,2,3,4} = {Daily, 24 Hourly, Custom, Timer, Disabled}
  const activeHeads = parsed.heads.filter((head: any) => head.mode !== 4).length;
  const totalHeads = parsed.heads.length;

  return `
    <div class="device-status-info">
      <div class="status-detail">
        <span class="detail-label">Active Heads:</span>
        <span class="detail-value">${activeHeads}/${totalHeads}</span>
      </div>
      ${parsed.weekday !== null && parsed.hour !== null && parsed.minute !== null ? `
        <div class="status-detail">
          <span class="detail-label">Device Time:</span>
          <span class="detail-value">${parsed.hour}:${parsed.minute.toString().padStart(2, '0')}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render light-specific status information
 */
function renderLightStatusInfo(parsed: any): string {
  if (!parsed) return '';

  return `
    <div class="device-status-info">
      ${parsed.current_hour !== null && parsed.current_minute !== null ? `
        <div class="status-detail">
          <span class="detail-label">Device Time:</span>
          <span class="detail-value">${parsed.current_hour}:${parsed.current_minute.toString().padStart(2, '0')}</span>
        </div>
      ` : ''}
      ${parsed.keyframes ? `
        <div class="status-detail">
          <span class="detail-label">Keyframes:</span>
          <span class="detail-value">${parsed.keyframes.length}</span>
        </div>
      ` : ''}
    </div>
  `;
}
