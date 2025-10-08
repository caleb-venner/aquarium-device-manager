/**
 * Production Dashboard - Main UI Component
 *
 * This is the main dashboard UI that provides:
 * - Overview of connected device status
 * - Configuration management interface
 * - Tabs for different views (Overview, Configurations, Dosers, Lights)
 */

import {
  getDoserConfigurations,
  getLightConfigurations,
  getConfigurationSummary,
  getSystemTimezone,
  type DoserDevice,
  type LightDevice,
  type ConfigurationSummary,
  type SystemTimezone,
} from "../api/configurations";
import { getDeviceStatus, scanDevices } from "../api/devices";
import type { StatusResponse, CachedStatus } from "../types/models";

// Dashboard state
let currentTab: "overview" | "configurations" | "dosers" | "lights" = "overview";
let doserConfigs: DoserDevice[] = [];
let lightConfigs: LightDevice[] = [];
let summary: ConfigurationSummary | null = null;
let deviceStatus: StatusResponse | null = null;
let isLoading = false;
let error: string | null = null;

/**
 * Main render function for the production dashboard
 */
export function renderProductionDashboard(): string {
  return `
    <div class="production-dashboard">
      ${renderHeader()}
      ${renderNavigation()}
      <main class="prod-main">
        ${renderContent()}
      </main>
    </div>
  `;
}

/**
 * Render the dashboard header
 */
function renderHeader(): string {
  return `
    <header class="prod-header">
      <div class="header-content">
        <div class="header-left">
          <div class="header-title">
            <h1>Aquarium BLE Device Manager</h1>
            <p class="header-subtitle">Production Dashboard - Device Status & Configuration Management</p>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" onclick="window.handleRefreshAll()">
            <span>🔄</span>
            Refresh All
          </button>
          <button class="btn btn-primary" onclick="window.handleScanDevices()">
            <span>📡</span>
            Scan Devices
          </button>
        </div>
      </div>
    </header>
  `;
}

/**
 * Render the navigation tabs
 */
function renderNavigation(): string {
  const doserCount = doserConfigs.length;
  const lightCount = lightConfigs.length;
  const totalConfigs = doserCount + lightCount;

  return `
    <nav class="prod-nav">
      <div class="nav-content">
        <button
          class="nav-tab ${currentTab === "overview" ? "active" : ""}"
          onclick="window.switchTab('overview')"
        >
          Overview
        </button>
        <button
          class="nav-tab ${currentTab === "configurations" ? "active" : ""}"
          onclick="window.switchTab('configurations')"
        >
          Configurations
          <span class="nav-badge">${totalConfigs}</span>
        </button>
        <button
          class="nav-tab ${currentTab === "dosers" ? "active" : ""}"
          onclick="window.switchTab('dosers')"
        >
          Dosers
          <span class="nav-badge">${doserCount}</span>
        </button>
        <button
          class="nav-tab ${currentTab === "lights" ? "active" : ""}"
          onclick="window.switchTab('lights')"
        >
          Lights
          <span class="nav-badge">${lightCount}</span>
        </button>
      </div>
    </nav>
  `;
}

/**
 * Render the main content area
 */
function renderContent(): string {
  if (isLoading) {
    return `
      <div class="spinner-container">
        <div class="spinner"></div>
      </div>
    `;
  }

  if (error) {
    return `
      <div class="alert alert-error">
        <div class="alert-icon">⚠️</div>
        <div class="alert-content">
          <h3 class="alert-title">Error Loading Data</h3>
          <p class="alert-message">${error}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="tab-panel ${currentTab === "overview" ? "active" : ""}" id="overview-panel">
      ${renderOverviewTab()}
    </div>
    <div class="tab-panel ${currentTab === "configurations" ? "active" : ""}" id="configurations-panel">
      ${renderConfigurationsTab()}
    </div>
    <div class="tab-panel ${currentTab === "dosers" ? "active" : ""}" id="dosers-panel">
      ${renderDosersTab()}
    </div>
    <div class="tab-panel ${currentTab === "lights" ? "active" : ""}" id="lights-panel">
      ${renderLightsTab()}
    </div>
  `;
}

/**
 * Render the overview tab - shows device connection status
 */
function renderOverviewTab(): string {
  if (!deviceStatus) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <h2 class="empty-state-title">Loading Device Status...</h2>
        <p class="empty-state-text">Please wait while we check your connected devices.</p>
      </div>
    `;
  }

  // Convert StatusResponse object to array
  const devices = Object.entries(deviceStatus).map(([address, status]) => ({
    ...status,
    address
  }));

  const connectedDevices = devices.filter(d => d.connected);
  const lightDevices = devices.filter(d => d.device_type === "light");
  const doserDevices = devices.filter(d => d.device_type === "doser");

  if (devices.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2 class="empty-state-title">No Devices Found</h2>
        <p class="empty-state-text">
          Start by scanning for devices or connecting to a device.
        </p>
        <button class="btn btn-primary" onclick="window.handleScanDevices()">
          Scan for Devices
        </button>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">System Status</h2>
        <div class="badge ${connectedDevices.length > 0 ? "badge-success" : "badge-gray"}">
          ${connectedDevices.length} of ${devices.length} connected
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 20px;">
        ${renderStatusCard("Total Devices", devices.length, "📱")}
        ${renderStatusCard("Connected", connectedDevices.length, "✅")}
        ${renderStatusCard("Light Devices", lightDevices.length, "💡")}
        ${renderStatusCard("Doser Devices", doserDevices.length, "⚗️")}
      </div>
    </div>

    ${lightDevices.length > 0 ? renderDeviceSection("Light Devices", lightDevices, "💡") : ""}
    ${doserDevices.length > 0 ? renderDeviceSection("Doser Devices", doserDevices, "⚗️") : ""}
  `;
}

/**
 * Render a status card for the overview
 */
function renderStatusCard(title: string, value: number, icon: string): string {
  return `
    <div class="card" style="text-align: center; padding: 24px;">
      <div style="font-size: 36px; margin-bottom: 8px;">${icon}</div>
      <div style="font-size: 28px; font-weight: 700; color: var(--gray-900); margin-bottom: 4px;">${value}</div>
      <div style="font-size: 13px; color: var(--gray-600);">${title}</div>
    </div>
  `;
}

/**
 * Render a device section with device tiles
 */
function renderDeviceSection(
  title: string,
  devices: Array<CachedStatus & { address: string }>,
  icon: string
): string {
  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <span style="margin-right: 8px;">${icon}</span>
          ${title}
        </h2>
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
  const deviceIcon = device.device_type === "light" ? "💡" : "💊";
  const deviceName = device.model_name || "Unknown Device";
  const timeAgo = getTimeAgo(device.updated_at);

  return `
    <div class="card device-card ${device.device_type} ${device.connected ? 'connected' : 'disconnected'}" style="padding: 0; border-left: 4px solid ${statusColor};">
      ${renderDeviceCardHeader(device, deviceIcon, deviceName, statusText, timeAgo)}
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
  deviceIcon: string,
  deviceName: string,
  statusText: string,
  timeAgo: string
): string {
  return `
    <div style="padding: 16px; border-bottom: 1px solid var(--gray-200);">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 24px;">${deviceIcon}</span>
            <h3 style="font-size: 18px; font-weight: 600; margin: 0; color: var(--gray-900);">
              ${deviceName}
            </h3>
          </div>
          <div style="font-size: 12px; font-family: monospace; color: var(--gray-600);">
            ${device.address}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: ${device.connected ? 'var(--success-light)' : 'var(--gray-100)'}; border-radius: 12px; font-size: 13px; font-weight: 500; color: ${device.connected ? 'var(--success)' : 'var(--gray-600)'}; margin-bottom: 4px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${device.connected ? 'var(--success)' : 'var(--gray-400)'};"></span>
            ${statusText}
          </div>
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
 * Render light device status
 */
function renderLightCardStatus(device: CachedStatus & { address: string }): string {
  const parsed = device.parsed as any; // LightParsed type
  if (!parsed) return renderNoDataStatus();

  const currentTime = parsed.current_hour !== null && parsed.current_minute !== null
    ? `${String(parsed.current_hour).padStart(2, '0')}:${String(parsed.current_minute).padStart(2, '0')}`
    : 'Unknown';

  const weekdayName = parsed.weekday !== null ? getWeekdayName(parsed.weekday) : 'Unknown';
  const keyframes = parsed.keyframes || [];
  const currentKeyframes = keyframes.filter((kf: any) => kf.value !== null);
  const maxBrightness = currentKeyframes.length > 0
    ? Math.max(...currentKeyframes.map((kf: any) => kf.percent || 0))
    : 0;

  // Use device.channels for actual channel count, not keyframes.length
  const channelCount = device.channels?.length || keyframes.length;

  return `
    <div style="padding: 16px; background: var(--gray-50);">
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Time</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--gray-900);">${currentTime}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Day</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--gray-900);">${weekdayName}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Max Brightness</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--primary);">${maxBrightness}%</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Channels</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--gray-900);">${channelCount}</div>
        </div>
      </div>
      ${renderChannelLevels(keyframes, device.channels || undefined)}
    </div>
  `;
}

/**
 * Render channel brightness levels - Placeholder for future implementation
 */
function renderChannelLevels(keyframes: any[], channels?: any[]): string {
  const channelCount = channels?.length || keyframes.length;

  return `
    <div style="background: white; padding: 16px; border-radius: 6px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 12px;">Channel Levels</div>
      <div style="padding: 40px 20px; text-align: center; background: var(--gray-50); border-radius: 6px; border: 2px dashed var(--gray-300);">
        <div style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;">📊</div>
        <div style="font-size: 14px; color: var(--gray-600); margin-bottom: 4px;">Real-time channel levels coming soon</div>
        <div style="font-size: 12px; color: var(--gray-500);">${channelCount} channel${channelCount !== 1 ? 's' : ''} detected</div>
      </div>
    </div>
  `;
}

/**
 * Render doser device status
 */
function renderDoserCardStatus(device: CachedStatus & { address: string }): string {
  const parsed = device.parsed as any; // DoserParsed type
  if (!parsed) return renderNoDataStatus();

  const currentTime = parsed.hour !== null && parsed.minute !== null
    ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
    : 'Unknown';

  const weekdayName = parsed.weekday !== null ? getWeekdayName(parsed.weekday) : 'Unknown';
  const heads = parsed.heads || [];

  // Count active heads based on mode_label (not mode number)
  const activeHeads = heads.filter((head: any) =>
    head.mode_label?.toLowerCase() !== 'disabled'
  ).length;

  return `
    <div style="padding: 16px; background: var(--gray-50);">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Time</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--gray-900);">${currentTime}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Day</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--gray-900);">${weekdayName}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Active Heads</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--primary);">${activeHeads}/${heads.length}</div>
        </div>
      </div>
      ${renderPumpHeads(heads)}
    </div>
  `;
}

/**
 * Render pump heads grid
 */
function renderPumpHeads(heads: any[]): string {
  return `
    <div style="background: white; padding: 16px; border-radius: 6px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 12px;">Pump Heads</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
        ${heads.map((head: any, index: number) => {
          // Check if disabled based on mode_label, not mode number
          const isDisabled = head.mode_label?.toLowerCase() === 'disabled';
          const isActive = !isDisabled;

          return `
            <div style="padding: 12px; background: ${isActive ? 'var(--success-light)' : 'var(--gray-50)'}; border: 1px solid ${isActive ? 'var(--success)' : 'var(--gray-200)'}; border-radius: 6px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: ${isDisabled ? '0' : '8px'};">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: ${isActive ? 'var(--success)' : 'var(--gray-300)'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">
                  ${index + 1}
                </div>
                <div style="font-size: 12px; font-weight: 600; color: ${isActive ? 'var(--success)' : 'var(--gray-500)'}; text-transform: capitalize;">
                  ${head.mode_label || 'Unknown'}
                </div>
              </div>
              ${!isDisabled ? `
                <div style="font-size: 13px; color: var(--gray-700);">
                  <div style="margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                    <span style="color: var(--gray-500); font-size: 14px;">⏰</span>
                    <span style="font-weight: 500;">${String(head.hour).padStart(2, '0')}:${String(head.minute).padStart(2, '0')}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: var(--gray-500); font-size: 14px;">💧</span>
                    <span style="font-weight: 500;">${(head.dosed_tenths_ml / 10).toFixed(1)}ml</span>
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * Render device control buttons
 */
function renderDeviceCardControls(device: CachedStatus & { address: string }): string {
  return `
    <div style="padding: 16px; border-top: 1px solid var(--gray-200); background: white;">
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <button class="btn btn-sm btn-secondary" style="flex: 1; min-width: 100px;">
          🔄 Refresh
        </button>
        <button class="btn btn-sm ${device.connected ? 'btn-warning' : 'btn-primary'}" style="flex: 1; min-width: 100px;">
          ${device.connected ? '🔌 Disconnect' : '🔗 Connect'}
        </button>
        ${device.connected ? renderDeviceSpecificControls(device) : ''}
      </div>
    </div>
  `;
}

/**
 * Render device-specific control buttons
 */
function renderDeviceSpecificControls(device: CachedStatus & { address: string }): string {
  if (device.device_type === "light") {
    return `
      <button class="btn btn-sm btn-success" style="flex: 1; min-width: 80px;">
        💡 On
      </button>
      <button class="btn btn-sm btn-secondary" style="flex: 1; min-width: 80px;">
        🌙 Off
      </button>
      <button class="btn btn-sm" style="flex: 1; min-width: 80px;">
        🤖 Auto
      </button>
    `;
  } else if (device.device_type === "doser") {
    return `
      <button class="btn btn-sm" style="flex: 1; min-width: 100px;">
        ⏰ Schedule
      </button>
      <button class="btn btn-sm" style="flex: 1; min-width: 100px;">
        🧪 Test Dose
      </button>
    `;
  }
  return '';
}

/**
 * Get weekday name from number (0=Sunday, 1=Monday, etc.)
 */
function getWeekdayName(weekday: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[weekday] || 'Unknown';
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000; // Convert to seconds
  const diff = now - timestamp;

  if (diff < 5) return 'Just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Render the configurations tab - shows saved configurations summary
 */
function renderConfigurationsTab(): string {
  if (!summary) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <h2 class="empty-state-title">Loading Configuration Summary...</h2>
        <p class="empty-state-text">Please wait while we load your device configurations.</p>
      </div>
    `;
  }

  const totalConfigs = summary.total_configurations;

  if (totalConfigs === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2 class="empty-state-title">No Configurations Found</h2>
        <p class="empty-state-text">
          Start by scanning for devices or connecting to a device to create a configuration.
        </p>
        <button class="btn btn-primary" onclick="window.handleScanDevices()">
          Scan for Devices
        </button>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Configuration Summary</h2>
        <div class="badge badge-info">${totalConfigs} Total</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
        ${renderSummaryCard("Doser Configurations", summary.dosers.count, "⚗️", "dosers")}
        ${renderSummaryCard("Light Profiles", summary.lights.count, "💡", "lights")}
      </div>
    </div>

    ${summary.dosers.count > 0 ? renderRecentDosers() : ""}
    ${summary.lights.count > 0 ? renderRecentLights() : ""}
  `;
}

/**
 * Render a summary card
 */
function renderSummaryCard(
  title: string,
  count: number,
  icon: string,
  tab: "dosers" | "lights"
): string {
  return `
    <div class="card" style="cursor: pointer;" onclick="window.switchTab('${tab}')">
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="font-size: 48px;">${icon}</div>
        <div>
          <div style="font-size: 32px; font-weight: 700; color: var(--gray-900);">${count}</div>
          <div style="color: var(--gray-600); font-size: 14px;">${title}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render recent dosers preview
 */
function renderRecentDosers(): string {
  const recentDosers = doserConfigs.slice(0, 3);

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Recent Doser Configurations</h2>
        <button class="btn btn-sm btn-secondary" onclick="window.switchTab('dosers')">
          View All →
        </button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${recentDosers.map(d => renderDoserPreview(d)).join("")}
      </div>
    </div>
  `;
}

/**
 * Render recent lights preview
 */
function renderRecentLights(): string {
  const recentLights = lightConfigs.slice(0, 3);

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Recent Light Profiles</h2>
        <button class="btn btn-sm btn-secondary" onclick="window.switchTab('lights')">
          View All →
        </button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${recentLights.map(l => renderLightPreview(l)).join("")}
      </div>
    </div>
  `;
}

/**
 * Render a doser preview item
 */
function renderDoserPreview(doser: DoserDevice): string {
  const configCount = doser.configurations?.length || 0;

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--gray-50); border-radius: 6px;">
      <div>
        <div style="font-weight: 600; color: var(--gray-900);">
          ${doser.name || doser.id}
        </div>
        <div style="font-size: 13px; color: var(--gray-600);">
          ${configCount} configuration${configCount !== 1 ? 's' : ''}
        </div>
      </div>
      <div class="badge badge-gray">${doser.id.slice(-8)}</div>
    </div>
  `;
}

/**
 * Render a light preview item
 */
function renderLightPreview(light: LightDevice): string {
  const configCount = light.configurations?.length || 0;
  const channelCount = light.channels?.length || 0;

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--gray-50); border-radius: 6px;">
      <div>
        <div style="font-weight: 600; color: var(--gray-900);">
          ${light.name || light.id}
        </div>
        <div style="font-size: 13px; color: var(--gray-600);">
          ${channelCount} channel${channelCount !== 1 ? 's' : ''} · ${configCount} config${configCount !== 1 ? 's' : ''}
        </div>
      </div>
      <div class="badge badge-gray">${light.id.slice(-8)}</div>
    </div>
  `;
}

/**
 * Render the dosers tab
 */
function renderDosersTab(): string {
  if (doserConfigs.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">⚗️</div>
        <h2 class="empty-state-title">No Doser Configurations</h2>
        <p class="empty-state-text">
          Connect to a doser device to automatically create a configuration profile.
        </p>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Doser Configurations</h2>
        <div class="badge badge-info">${doserConfigs.length}</div>
      </div>
    </div>
    <div class="config-grid">
      ${doserConfigs.map(d => renderDoserCard(d)).join("")}
    </div>
  `;
}

/**
 * Render a doser configuration card
 */
function renderDoserCard(doser: DoserDevice): string {
  const configCount = doser.configurations?.length || 0;
  const activeConfig = doser.activeConfigurationId || "none";

  // Format datetime with date and time
  const formatDateTime = (isoString: string | undefined) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${doser.name || "Doser Device"}</h3>
        <div class="card-actions">
          <button class="btn-icon" title="Configure" onclick="window.handleConfigureDoser('${doser.id}')">⚙️</button>
          <button class="btn-icon" title="Delete" onclick="window.handleDeleteDoser('${doser.id}')">🗑️</button>
        </div>
      </div>
      <div style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Device ID</div>
        <div style="font-family: monospace; font-size: 14px; color: var(--gray-700);">${doser.id}</div>
      </div>
      <div style="margin-bottom: 12px;">
        <div class="badge ${configCount > 0 ? "badge-success" : "badge-gray"}">
          ${configCount} configuration${configCount !== 1 ? 's' : ''}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 13px; color: var(--gray-600);">
          <strong>Timezone:</strong> ${doser.timezone || 'Not set'}
        </div>
        <div style="font-size: 13px; color: var(--gray-600);">
          <strong>Active Config:</strong> ${activeConfig}
        </div>
        ${doser.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Updated: ${formatDateTime(doser.updatedAt)}</div>` : ''}
        ${doser.createdAt && !doser.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Created: ${formatDateTime(doser.createdAt)}</div>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render the lights tab
 */
function renderLightsTab(): string {
  if (lightConfigs.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">💡</div>
        <h2 class="empty-state-title">No Light Profiles</h2>
        <p class="empty-state-text">
          Connect to a light device to automatically create a configuration profile.
        </p>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Light Profiles</h2>
        <div class="badge badge-info">${lightConfigs.length}</div>
      </div>
    </div>
    <div class="config-grid">
      ${lightConfigs.map(l => renderLightCard(l)).join("")}
    </div>
  `;
}

/**
 * Render a light configuration card
 */
function renderLightCard(light: LightDevice): string {
  const configCount = light.configurations?.length || 0;
  const channelCount = light.channels?.length || 0;
  const activeConfig = light.activeConfigurationId || "none";

  // Format datetime with date and time
  const formatDateTime = (isoString: string | undefined) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${light.name || "Light Device"}</h3>
        <div class="card-actions">
          <button class="btn-icon" title="Edit" onclick="alert('Edit feature coming soon')">✏️</button>
          <button class="btn-icon" title="Delete" onclick="window.handleDeleteLight('${light.id}')">🗑️</button>
        </div>
      </div>
      <div style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Device ID</div>
        <div style="font-family: monospace; font-size: 14px; color: var(--gray-700);">${light.id}</div>
      </div>
      <div style="margin-bottom: 12px;">
        <div class="badge ${configCount > 0 ? "badge-success" : "badge-gray"}">
          ${configCount} configuration${configCount !== 1 ? 's' : ''}
        </div>
        ${channelCount > 0 ? `<div class="badge badge-info" style="margin-left: 8px;">${channelCount} channel${channelCount !== 1 ? 's' : ''}</div>` : ''}
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 13px; color: var(--gray-600);">
          <strong>Timezone:</strong> ${light.timezone || 'Not set'}
        </div>
        <div style="font-size: 13px; color: var(--gray-600);">
          <strong>Active Config:</strong> ${activeConfig}
        </div>
        ${light.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Updated: ${formatDateTime(light.updatedAt)}</div>` : ''}
        ${light.createdAt && !light.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Created: ${formatDateTime(light.createdAt)}</div>` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// Data Loading
// ============================================================================

/**
 * Load all data from the API
 */
async function loadAllConfigurations() {
  isLoading = true;
  error = null;
  refreshDashboard();

  try {
    // Load configurations and device status in parallel
    const results = await Promise.allSettled([
      getDoserConfigurations(),
      getLightConfigurations(),
      getConfigurationSummary(),
      getDeviceStatus(),
    ]);

    // Handle doser configs
    if (results[0].status === "fulfilled") {
      doserConfigs = results[0].value;
    } else {
      console.error("❌ Failed to load doser configs:", results[0].reason);
      doserConfigs = [];
    }

    // Handle light configs
    if (results[1].status === "fulfilled") {
      lightConfigs = results[1].value;
    } else {
      console.error("❌ Failed to load light configs:", results[1].reason);
      lightConfigs = [];
    }

    // Handle summary (gracefully fail if it errors)
    if (results[2].status === "fulfilled") {
      summary = results[2].value;
    } else {
      console.error("❌ Failed to load summary:", results[2].reason);
      // Create a fallback summary from the configs we did load
      summary = {
        total_configurations: doserConfigs.length + lightConfigs.length,
        dosers: {
          count: doserConfigs.length,
          addresses: doserConfigs.map(d => d.id),
        },
        lights: {
          count: lightConfigs.length,
          addresses: lightConfigs.map(d => d.id),
        },
        storage_paths: {
          doser_configs: "~/.chihiros/doser_configs.json",
          light_profiles: "~/.chihiros/light_profiles.json",
        },
      };
    }

    // Handle device status
    if (results[3].status === "fulfilled") {
      deviceStatus = results[3].value;
    } else {
      console.error("❌ Failed to load device status:", results[3].reason);
      deviceStatus = {};
    }

    console.log("✅ Loaded data:", {
      dosers: doserConfigs.length,
      lights: lightConfigs.length,
      devices: Object.keys(deviceStatus || {}).length,
      summary: summary ? "loaded" : "fallback"
    });
  } catch (err) {
    console.error("❌ Failed to load data:", err);
    error = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading = false;
    refreshDashboard();
  }
}

/**
 * Refresh the dashboard UI
 */
function refreshDashboard() {
  const appElement = document.getElementById("app");
  if (appElement) {
    appElement.innerHTML = renderProductionDashboard();
  }
}

// ============================================================================
// Global Event Handlers
// ============================================================================

// Initialize global handlers BEFORE loading data
(window as any).switchTab = async (tab: "overview" | "configurations" | "dosers" | "lights") => {
  currentTab = tab;
  refreshDashboard();
};

(window as any).handleRefreshAll = async () => {
  await loadAllConfigurations();
};

(window as any).handleScanDevices = async () => {
  const button = document.querySelector('button[onclick="window.handleScanDevices()"]') as HTMLButtonElement;
  const originalText = button?.innerHTML;

  try {
    // Show loading state
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span>🔍</span> Scanning...';
    }

    const results = await scanDevices();
    alert(`Device scan completed!\n\nFound ${results.length} device${results.length !== 1 ? 's' : ''}:\n${results.map(device => `• ${device.name} (${device.address})`).join('\n')}`);
  } catch (err) {
    alert(`Failed to scan for devices: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Restore button state
    if (button && originalText) {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }
};

(window as any).useSystemTimezone = async () => {
  try {
    const timezoneInfo = await getSystemTimezone();
    const timezoneInput = document.getElementById('device-timezone') as HTMLInputElement;
    const hint = document.getElementById('timezone-hint');

    if (timezoneInput) {
      timezoneInput.value = timezoneInfo.default_for_new_devices;

      // Update hint with detected timezone
      if (hint) {
        hint.textContent = `System timezone detected: ${timezoneInfo.system_timezone}`;
        hint.style.color = '#28a745'; // green color for success
      }
    }
  } catch (err) {
    const hint = document.getElementById('timezone-hint');
    if (hint) {
      hint.textContent = `Failed to detect system timezone: ${err instanceof Error ? err.message : String(err)}`;
      hint.style.color = '#dc3545'; // red color for error
    }
  }
};

(window as any).handleDeleteDoser = async (deviceId: string) => {
  if (confirm(`Are you sure you want to delete the configuration for ${deviceId}?`)) {
    try {
      const { deleteDoserConfiguration } = await import("../api/configurations");
      await deleteDoserConfiguration(deviceId);
      await loadAllConfigurations();
    } catch (err) {
      alert(`Failed to delete configuration: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};

(window as any).handleDeleteLight = async (deviceId: string) => {
  if (confirm(`Are you sure you want to delete the profile for ${deviceId}?`)) {
    try {
      const { deleteLightConfiguration } = await import("../api/configurations");
      await deleteLightConfiguration(deviceId);
      await loadAllConfigurations();
    } catch (err) {
      alert(`Failed to delete profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};

(window as any).handleConfigureDoser = async (deviceId: string) => {
  try {
    const { getDoserConfiguration } = await import("../api/configurations");
    const device = await getDoserConfiguration(deviceId);
    showDoserConfigurationModal(device);
  } catch (err) {
    alert(`Failed to load doser configuration: ${err instanceof Error ? err.message : String(err)}`);
  }
};

/**
 * Show the doser configuration modal
 */
function showDoserConfigurationModal(device: DoserDevice): void {
  currentConfigDevice = device; // Set global state

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>Configure Doser: ${device.name || device.id}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove(); currentConfigDevice = null;">×</button>
      </div>
      <div class="modal-body">
        ${renderDoserConfigurationForm(device)}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Load system timezone info for the hint
  loadTimezoneHint();

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      currentConfigDevice = null;
    }
  });
}

/**
 * Load timezone hint information for the modal
 */
async function loadTimezoneHint(): Promise<void> {
  try {
    const timezoneInfo = await getSystemTimezone();
    const hint = document.getElementById('timezone-hint');
    if (hint) {
      hint.textContent = `System timezone: ${timezoneInfo.system_timezone} (click Auto to use)`;
      hint.style.color = '#666';
    }
  } catch (err) {
    const hint = document.getElementById('timezone-hint');
    if (hint) {
      hint.textContent = 'Click Auto to detect system timezone';
      hint.style.color = '#666';
    }
  }
}

/**
 * Render the doser configuration form
 */
function renderDoserConfigurationForm(device: DoserDevice): string {
  const activeConfig = device.configurations.find(c => c.id === device.activeConfigurationId);
  if (!activeConfig) {
    return '<p>No active configuration found.</p>';
  }

  const latestRevision = activeConfig.revisions[activeConfig.revisions.length - 1];
  const heads = latestRevision.heads || [];

  return `
    <div class="config-form">
      <div class="form-section">
        <h3>Device Information</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Device ID:</label>
            <input type="text" value="${device.id}" readonly style="background: #f5f5f5;">
          </div>
          <div class="form-group">
            <label>Name:</label>
            <input type="text" id="device-name" value="${device.name || ''}" placeholder="Enter device name">
          </div>
          <div class="form-group">
            <label>Timezone:</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="text" id="device-timezone" value="${device.timezone}" placeholder="e.g., America/New_York" style="flex: 1;">
              <button type="button" class="btn btn-secondary" onclick="window.useSystemTimezone()" title="Use system timezone">
                🌍 Auto
              </button>
            </div>
            <small style="color: #666; font-size: 12px;" id="timezone-hint">
              Current system timezone will be detected automatically
            </small>
          </div>
        </div>
      </div>

      <div class="form-section">
        <h3>Dosing Heads Configuration</h3>
        <div class="heads-container">
          ${heads.map((head, index) => renderHeadConfiguration(head, index)).join('')}
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="window.saveDoserConfiguration('${device.id}')">Save Configuration</button>
        <button class="btn btn-success" onclick="window.sendToDevice('${device.id}')">Send to Device</button>
      </div>
    </div>
  `;
}

/**
 * Render a single head configuration
 */
function renderHeadConfiguration(head: any, index: number): string {
  const schedule = head.schedule || {};

  return `
    <div class="head-config" data-head-index="${head.index}">
      <div class="head-header">
        <h4>Head ${head.index} ${head.label ? `- ${head.label}` : ''}</h4>
        <label class="switch">
          <input type="checkbox" ${head.active ? 'checked' : ''} onchange="window.toggleHead(${head.index}, this.checked)">
          <span class="slider"></span>
        </label>
      </div>

      <div class="head-details ${!head.active ? 'disabled' : ''}">
        <div class="form-group">
          <label>Label:</label>
          <input type="text" value="${head.label || ''}" placeholder="e.g., Trace Elements"
                 onchange="window.updateHeadLabel(${head.index}, this.value)">
        </div>

        <div class="form-group">
          <label>Schedule Mode:</label>
          <select onchange="window.updateScheduleMode(${head.index}, this.value)" ${!head.active ? 'disabled' : ''}>
            <option value="single" ${schedule.mode === 'single' ? 'selected' : ''}>Single Daily Dose</option>
            <option value="timer" ${schedule.mode === 'timer' ? 'selected' : ''}>Timer Schedule</option>
            <option value="every_hour" ${schedule.mode === 'every_hour' ? 'selected' : ''}>Every Hour</option>
            <option value="custom_periods" ${schedule.mode === 'custom_periods' ? 'selected' : ''}>Custom Periods</option>
          </select>
        </div>

        ${renderScheduleDetails(schedule, head.index)}

        <div class="form-group">
          <label>Active Days:</label>
          <div class="weekday-selector">
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `
              <label class="weekday-label">
                <input type="checkbox" value="${day}"
                       ${head.recurrence?.days?.includes(day) ? 'checked' : ''}
                       onchange="window.updateRecurrence(${head.index})"
                       ${!head.active ? 'disabled' : ''}>
                <span>${day}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Calibration (mL/second):</label>
          <input type="number" step="0.1" value="${head.calibration?.mlPerSecond || 1.0}"
                 onchange="window.updateCalibration(${head.index}, this.value)"
                 ${!head.active ? 'disabled' : ''}>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render schedule-specific details
 */
function renderScheduleDetails(schedule: any, headIndex: number): string {
  const disabled = !schedule || schedule.mode === 'disabled';

  switch (schedule.mode) {
    case 'single':
      return `
        <div class="form-group">
          <label>Daily Dose (mL):</label>
          <input type="number" step="0.1" value="${schedule.dailyDoseMl || 1.0}"
                 onchange="window.updateScheduleParam(${headIndex}, 'dailyDoseMl', parseFloat(this.value))"
                 ${disabled ? 'disabled' : ''}>
        </div>
        <div class="form-group">
          <label>Dose Time:</label>
          <input type="time" value="${schedule.startTime || '09:00'}"
                 onchange="window.updateScheduleParam(${headIndex}, 'startTime', this.value)"
                 ${disabled ? 'disabled' : ''}>
        </div>
      `;

    case 'timer':
      const doses = schedule.doses || [];
      return `
        <div class="form-group">
          <label>Timer Doses:</label>
          <div class="timer-doses">
            ${doses.map((dose: any, index: number) => `
              <div class="timer-dose">
                <input type="time" value="${dose.time}"
                       onchange="window.updateTimerDose(${headIndex}, ${index}, 'time', this.value)"
                       ${disabled ? 'disabled' : ''}>
                <input type="number" step="0.1" value="${dose.quantityMl}"
                       placeholder="mL" min="0.1"
                       onchange="window.updateTimerDose(${headIndex}, ${index}, 'quantityMl', parseFloat(this.value))"
                       ${disabled ? 'disabled' : ''}>
                <button class="btn-icon" onclick="window.removeTimerDose(${headIndex}, ${index})"
                        ${disabled ? 'disabled' : ''}>🗑️</button>
              </div>
            `).join('')}
            <button class="btn btn-small" onclick="window.addTimerDose(${headIndex})" ${disabled ? 'disabled' : ''}>
              + Add Dose
            </button>
          </div>
        </div>
      `;

    case 'every_hour':
      return `
        <div class="form-group">
          <label>Daily Dose (mL):</label>
          <input type="number" step="0.1" value="${schedule.dailyDoseMl || 1.0}"
                 onchange="window.updateScheduleParam(${headIndex}, 'dailyDoseMl', parseFloat(this.value))"
                 ${disabled ? 'disabled' : ''}>
        </div>
        <div class="form-group">
          <label>Start Time:</label>
          <input type="time" value="${schedule.startTime || '09:00'}"
                 onchange="window.updateScheduleParam(${headIndex}, 'startTime', this.value)"
                 ${disabled ? 'disabled' : ''}>
        </div>
        <div class="form-note">
          <small>Dose will be split into 24 equal parts, starting at the specified time.</small>
        </div>
      `;

    default:
      return `<p class="form-note">Select a schedule mode to configure dosing parameters.</p>`;
  }
}

// Configuration form helper functions
(window as any).toggleHead = (headIndex: number, active: boolean) => {
  if (!currentConfigDevice) return;

  const head = findHead(headIndex);
  if (head) {
    head.active = active;
    updateFormVisibility();
  }
};

(window as any).updateHeadLabel = (headIndex: number, label: string) => {
  const head = findHead(headIndex);
  if (head) {
    head.label = label;
  }
};

(window as any).updateScheduleMode = (headIndex: number, mode: string) => {
  const head = findHead(headIndex);
  if (head) {
    // Reset schedule to default for the new mode
    switch (mode) {
      case 'single':
        head.schedule = { mode: 'single', dailyDoseMl: 1.0, startTime: '09:00' };
        break;
      case 'timer':
        head.schedule = { mode: 'timer', doses: [] };
        break;
      case 'every_hour':
        head.schedule = { mode: 'every_hour', dailyDoseMl: 1.0, startTime: '09:00' };
        break;
      case 'custom_periods':
        head.schedule = { mode: 'custom_periods', dailyDoseMl: 1.0, periods: [] };
        break;
    }
    refreshConfigurationModal();
  }
};

(window as any).updateScheduleParam = (headIndex: number, param: string, value: any) => {
  const head = findHead(headIndex);
  if (head && head.schedule) {
    head.schedule[param] = value;
  }
};

(window as any).updateRecurrence = (headIndex: number) => {
  const head = findHead(headIndex);
  if (!head) return;

  const container = document.querySelector(`[data-head-index="${headIndex}"] .weekday-selector`);
  if (!container) return;

  const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked') as NodeListOf<HTMLInputElement>;
  const selectedDays = Array.from(checkboxes).map(cb => cb.value);

  head.recurrence = { days: selectedDays };
};

(window as any).updateCalibration = (headIndex: number, mlPerSecond: string) => {
  const head = findHead(headIndex);
  if (head) {
    head.calibration = head.calibration || {};
    head.calibration.mlPerSecond = parseFloat(mlPerSecond) || 1.0;
  }
};

(window as any).addTimerDose = (headIndex: number) => {
  const head = findHead(headIndex);
  if (head && head.schedule && head.schedule.mode === 'timer') {
    head.schedule.doses = head.schedule.doses || [];
    head.schedule.doses.push({ time: '09:00', quantityMl: 1.0 });
    refreshConfigurationModal();
  }
};

(window as any).removeTimerDose = (headIndex: number, doseIndex: number) => {
  const head = findHead(headIndex);
  if (head && head.schedule && head.schedule.mode === 'timer') {
    head.schedule.doses = head.schedule.doses || [];
    head.schedule.doses.splice(doseIndex, 1);
    refreshConfigurationModal();
  }
};

(window as any).updateTimerDose = (headIndex: number, doseIndex: number, param: string, value: any) => {
  const head = findHead(headIndex);
  if (head && head.schedule && head.schedule.mode === 'timer') {
    head.schedule.doses = head.schedule.doses || [];
    if (head.schedule.doses[doseIndex]) {
      head.schedule.doses[doseIndex][param] = value;
    }
  }
};

(window as any).saveDoserConfiguration = async (deviceId: string) => {
  if (!currentConfigDevice) return;

  try {
    // Update device name and timezone from form
    const nameInput = document.getElementById('device-name') as HTMLInputElement;
    const timezoneInput = document.getElementById('device-timezone') as HTMLInputElement;

    if (nameInput) currentConfigDevice.name = nameInput.value;
    if (timezoneInput) currentConfigDevice.timezone = timezoneInput.value;

    const { updateDoserConfiguration } = await import("../api/configurations");
    await updateDoserConfiguration(deviceId, currentConfigDevice);

    alert('Configuration saved successfully!');
    await loadAllConfigurations();
    document.querySelector('.modal-overlay')?.remove();
  } catch (err) {
    alert(`Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`);
  }
};

(window as any).sendToDevice = async (deviceId: string) => {
  if (!currentConfigDevice) return;

  const activeConfig = currentConfigDevice.configurations.find(c => c.id === currentConfigDevice!.activeConfigurationId);
  if (!activeConfig) {
    alert('No active configuration found');
    return;
  }

  const latestRevision = activeConfig.revisions[activeConfig.revisions.length - 1];
  const heads = latestRevision.heads || [];

  try {
    const { executeCommand } = await import("../api/commands");

    // Send commands for each active head
    for (const head of heads) {
      if (!head.active || !head.schedule) continue;

      // Convert the schedule to BLE command parameters
      const commandParams = convertScheduleToBLEParams(head);
      if (!commandParams) continue;

      const commandRequest = {
        action: 'set_schedule',
        args: {
          head_index: head.index - 1, // API expects 0-based index
          volume_tenths_ml: Math.round(commandParams.volumeMl * 10),
          hour: commandParams.hour,
          minute: commandParams.minute,
          weekdays: convertRecurrenceToBLEWeekdays(head.recurrence),
          confirm: true,
          wait_seconds: 2.0
        }
      };

      await executeCommand(deviceId, commandRequest);
    }

    alert('Configuration sent to device successfully!');
  } catch (err) {
    alert(`Failed to send to device: ${err instanceof Error ? err.message : String(err)}`);
  }
};

// Helper functions
function findHead(headIndex: number): any {
  if (!currentConfigDevice) return null;

  const activeConfig = currentConfigDevice.configurations.find(c => c.id === currentConfigDevice!.activeConfigurationId);
  if (!activeConfig) return null;

  const latestRevision = activeConfig.revisions[activeConfig.revisions.length - 1];
  return latestRevision.heads?.find((h: any) => h.index === headIndex);
}

function updateFormVisibility(): void {
  // Update disabled state of form elements based on head active status
  document.querySelectorAll('.head-config').forEach(headElement => {
    const headIndex = parseInt(headElement.getAttribute('data-head-index') || '0');
    const head = findHead(headIndex);
    const details = headElement.querySelector('.head-details');

    if (details) {
      if (head?.active) {
        details.classList.remove('disabled');
        details.querySelectorAll('input, select, button').forEach((el: any) => el.disabled = false);
      } else {
        details.classList.add('disabled');
        details.querySelectorAll('input, select, button').forEach((el: any) => el.disabled = true);
      }
    }
  });
}

function refreshConfigurationModal(): void {
  if (!currentConfigDevice) return;

  const modalBody = document.querySelector('.modal-body');
  if (modalBody) {
    modalBody.innerHTML = renderDoserConfigurationForm(currentConfigDevice);
  }
}

function convertScheduleToBLEParams(head: any): { volumeMl: number; hour: number; minute: number } | null {
  if (!head.schedule) return null;

  const schedule = head.schedule;
  let volumeMl = 0;
  let hour = 9;
  let minute = 0;

  switch (schedule.mode) {
    case 'single':
      volumeMl = schedule.dailyDoseMl || 1.0;
      const time = schedule.startTime || '09:00';
      [hour, minute] = time.split(':').map(Number);
      break;

    case 'timer':
      // For timer mode, use the first dose time and sum all volumes
      const doses = schedule.doses || [];
      if (doses.length === 0) return null;

      volumeMl = doses.reduce((sum: number, dose: any) => sum + (dose.quantityMl || 0), 0);
      const firstTime = doses[0].time || '09:00';
      [hour, minute] = firstTime.split(':').map(Number);
      break;

    case 'every_hour':
      volumeMl = schedule.dailyDoseMl || 1.0;
      const startTime = schedule.startTime || '09:00';
      [hour, minute] = startTime.split(':').map(Number);
      break;

    default:
      return null;
  }

  return { volumeMl, hour, minute };
}

function convertRecurrenceToBLEWeekdays(recurrence: any): number[] | undefined {
  if (!recurrence?.days) return undefined;

  const dayMap: Record<string, number> = {
    'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 0
  };

  return recurrence.days.map((day: string) => dayMap[day]).filter((n: number) => n !== undefined);
}

// Global state for the current configuration being edited
let currentConfigDevice: DoserDevice | null = null;

// Auto-load configurations on module load (after handlers are registered)
loadAllConfigurations();
