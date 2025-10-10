/**
 * Production Dashboard - Main UI Component
 *
 * This is the main dashboard UI that provides:
 * - Overview of connected device status
 * - Configuration management interface
 * - Tabs for different views (Overview, Devices, Dev)
 */

import {
  getDoserConfigurations,
  getLightConfigurations,
  getConfigurationSummary,
  listDoserMetadata,
  listLightMetadata,
  type DoserDevice,
  type LightDevice,
  type LightChannel,
  type ConfigurationSummary,
  type DeviceMetadata,
  type LightMetadata,
} from "../api/configurations";
import { getDeviceStatus, scanDevices, connectDevice } from "../api/devices";
import type { StatusResponse, CachedStatus, ScanDevice } from "../types/models";
import { useActions } from "../stores/deviceStore";
import { renderNotifications } from "./notifications";
import {
  calculateLightWattage,
  formatWattage,
  getMaxWattage,
  getTheoreticalMaxWattage,
  type ChannelPercentages,
  type WattageCalculationResult
} from "../utils/wattage-calculator";

// Dashboard state
let currentTab: "overview" | "devices" | "dev" = "overview";
let doserConfigs: DoserDevice[] = [];
let lightConfigs: LightDevice[] = [];
let doserMetadata: DeviceMetadata[] = [];
let lightMetadata: LightMetadata[] = [];
let summary: ConfigurationSummary | null = null;
let deviceStatus: StatusResponse | null = null;
let isLoading = false;
let error: string | null = null;
let scanResults: ScanDevice[] = [];
let isScanning = false;

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
          <button class="btn btn-primary" onclick="window.handleScanDevices()" ${isScanning ? 'disabled' : ''}>
            <span>📡</span>
            ${isScanning ? 'Scanning...' : 'Scan Devices'}
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
          class="nav-tab ${currentTab === "devices" ? "active" : ""}"
          onclick="window.switchTab('devices')"
        >
          Devices
          <span class="nav-badge">${totalConfigs}</span>
        </button>
        <button
          class="nav-tab ${currentTab === "dev" ? "active" : ""}"
          onclick="window.switchTab('dev')"
        >
          Dev
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
    <div class="tab-panel ${currentTab === "devices" ? "active" : ""}" id="devices-panel">
      ${renderDevicesTab()}
    </div>
    <div class="tab-panel ${currentTab === "dev" ? "active" : ""}" id="dev-panel">
      ${renderDevTab()}
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

  // Show empty state if no devices, but don't show scan results here
  if (devices.length === 0) {
    return `
      <div class="empty-state">
        <h2 class="empty-state-title">No Connected Devices</h2>
        <p class="empty-state-text">Use the "Scan Devices" button in the header to find and connect devices.</p>
      </div>
    `;
  }

  return `
    ${renderDeviceSection("Connected Devices", devices)}
  `;
}

/**
 * Render the unified scan section (replaces empty state when scanning/results available)
 */
function renderScanSection(showEmptyState: boolean): string {
  const connectedAddresses = deviceStatus ? Object.keys(deviceStatus) : [];
  const newDevices = scanResults.filter(device => !connectedAddresses.includes(device.address));

  if (isScanning) {
    return `
      <div class="scan-state">
        <div class="scan-state-content">
          <div class="scan-spinner">🔄</div>
          <h2 class="scan-state-title">Scanning for Devices...</h2>
          <p class="scan-state-text">Searching for nearby BLE devices. This may take a few seconds.</p>
        </div>
      </div>
    `;
  }

  if (scanResults.length > 0) {
    if (newDevices.length === 0) {
      return `
        <div class="scan-state">
          <div class="scan-state-content">
            <h2 class="scan-state-title">No New Devices Found</h2>
            <p class="scan-state-text">
              Found ${scanResults.length} device${scanResults.length !== 1 ? 's' : ''}, but they are already connected.
            </p>
            <button class="btn btn-primary" onclick="window.handleScanDevices()">
              Scan Again
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="scan-state">
        <div class="scan-state-content">
          <h2 class="scan-state-title">Discovered Devices</h2>
          <p class="scan-state-text">
            Found ${newDevices.length} new device${newDevices.length !== 1 ? 's' : ''}. Click "Connect" to add them to your dashboard.
          </p>
          <div class="scan-results-grid">
            ${newDevices.map(device => renderScanResultCard(device)).join("")}
          </div>
          <div class="scan-actions">
            <button class="btn btn-secondary" onclick="window.clearScanResults()">
              Clear Results
            </button>
            <button class="btn btn-primary" onclick="window.handleScanDevices()">
              Scan Again
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (showEmptyState) {
    return `
      <div class="scan-state">
        <div class="scan-state-content">
          <h2 class="scan-state-title">No Devices Found</h2>
          <p class="scan-state-text">
            Start by scanning for devices or connecting to a device manually.
          </p>
          <button class="btn btn-primary" onclick="window.handleScanDevices()">
            Scan for Devices
          </button>
        </div>
      </div>
    `;
  }

  return '';
}

/**
 * Render a single scan result card
 */
function renderScanResultCard(device: ScanDevice): string {
  return `
    <div class="card device-scan-card">
      <div class="scan-card-content">
        <div class="scan-card-info">
          <h3 class="scan-card-title">${device.name}</h3>
          <p class="scan-card-address">${device.address}</p>
          <div class="scan-card-meta">
            <span class="badge badge-secondary">${device.device_type}</span>
            <span class="scan-card-product">${device.product}</span>
          </div>
        </div>
        <button
          class="btn btn-primary scan-card-button"
          onclick="window.handleConnectDevice('${device.address}')"
          title="Connect to this device and add it to your dashboard"
        >
          <span>🔌</span>
          Connect
        </button>
      </div>
    </div>
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
 * Get the configured name for a device, falling back to model name
 */
function getDeviceDisplayName(device: CachedStatus & { address: string }): string {
  // First, check if there's a configured name in metadata
  if (device.device_type === "doser") {
    const metadata = doserMetadata.find(m => m.id === device.address);
    if (metadata?.name) {
      return metadata.name;
    }
  } else if (device.device_type === "light") {
    const metadata = lightMetadata.find(m => m.id === device.address);
    if (metadata?.name) {
      return metadata.name;
    }
  }

  // Fall back to model name or generic name
  return device.model_name || "Unknown Device";
}

/**
 * Render an individual device tile with full device info
 */
function renderDeviceTile(device: CachedStatus & { address: string }): string {
  const statusColor = device.connected ? "var(--success)" : "var(--gray-400)";
  const statusText = device.connected ? "Connected" : "Disconnected";
  const deviceName = getDeviceDisplayName(device);
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
  return `
    <div style="padding: 16px; border-bottom: 1px solid var(--gray-200);">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
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

  // Create combined date/time display
  const dateTimeDisplay = currentTime !== 'Unknown' && weekdayName !== 'Unknown'
    ? formatDateTime(parsed.current_hour, parsed.current_minute, parsed.weekday)
    : 'Unknown';

  const keyframes = parsed.keyframes || [];
  const currentKeyframes = keyframes.filter((kf: any) => kf.value !== null);
  const maxBrightness = currentKeyframes.length > 0
    ? Math.max(...currentKeyframes.map((kf: any) => kf.percent || 0))
    : 0;

  // Use device.channels for actual channel count, default to 4 if not available
  const channelCount = device.channels?.length || 4;

  return `
    <div style="padding: 16px; background: var(--gray-50);">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Time</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--gray-900);">${dateTimeDisplay}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Max Brightness</div>
          <div style="font-size: 20px; font-weight: 700, color: var(--primary);">${maxBrightness}%</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Channels</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--gray-900);">${channelCount}</div>
        </div>
      </div>
      ${renderChannelLevels(keyframes, device.channels || undefined, device.address)}
    </div>
  `;
}

/**
 * Get channel names for a device based on its model
 */
function getDeviceChannelNames(deviceAddress: string): string[] {
  const device = deviceStatus && deviceStatus[deviceAddress];
  if (!device) return ['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4'];

  const modelName = device.model_name?.toLowerCase() || '';

  // WRGB devices have Red, Green, Blue, White channels
  if (modelName.includes('wrgb')) {
    return ['Red', 'Green', 'Blue', 'White'];
  }

  // RGB devices
  if (modelName.includes('rgb')) {
    return ['Red', 'Green', 'Blue'];
  }

  // Default fallback
  return ['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4'];
}

/**
 * Render channel brightness levels with interactive controls
 */
function renderChannelLevels(keyframes: any[], channels?: any[], deviceAddress?: string): string {
  const channelCount = channels?.length || 4; // Default to 4 channels if not specified

  // Get current schedule intensity from keyframes (represents max intensity across all channels)
  const currentIntensity = keyframes.length > 0
    ? Math.max(...keyframes.map((kf: any) => kf.percent || 0))
    : 0;

  if (!deviceAddress) {
    return `
      <div style="background: white; padding: 16px; border-radius: 6px;">
        <div style="font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 12px;">Channel Levels</div>
        <div style="padding: 40px 20px; text-align: center; background: var(--gray-50); border-radius: 6px; border: 2px dashed var(--gray-300);">
          <div style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;">📊</div>
          <div style="font-size: 14px; color: var(--gray-600); margin-bottom: 4px;">No device data available</div>
          <div style="font-size: 12px; color: var(--gray-500);">${channelCount} channel${channelCount !== 1 ? 's' : ''} detected</div>
        </div>
      </div>
    `;
  }

  // Get channel names for the device
  const channelNames = getDeviceChannelNames(deviceAddress);

  return `
    <div style="background: white; padding: 16px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 13px; font-weight: 600; color: var(--gray-700);">Channel Controls</div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-secondary" onclick="window.handleSetManualMode('${deviceAddress}')" title="Switch to Manual Mode">
            🎛️ Manual
          </button>
          <button class="btn btn-sm btn-warning" onclick="window.handleClearAutoSettings('${deviceAddress}')" title="Clear Auto Settings">
            🗑️ Clear Auto
          </button>
        </div>
      </div>

      ${keyframes.length === 0 ? `
        <div style="padding: 20px; text-align: center; background: var(--gray-50); border-radius: 6px; border: 2px dashed var(--gray-300); margin-bottom: 16px;">
          <div style="font-size: 14px; color: var(--gray-600); margin-bottom: 4px;">No schedule data</div>
          <div style="font-size: 12px; color: var(--gray-500);">Set auto programs or switch to manual mode to control channels</div>
        </div>
      ` : `
        <div style="background: var(--primary-light); padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid var(--primary);">
          <div style="font-size: 12px; font-weight: 600; color: var(--primary); margin-bottom: 4px;">Current Schedule Intensity</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--primary);">${currentIntensity}%</div>
          <div style="font-size: 11px; color: var(--primary); opacity: 0.8;">Based on auto schedule (affects all channels proportionally)</div>
        </div>
      `}

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        ${Array.from({ length: channelCount }, (_, index) => {
          const channelName = channelNames[index] || `Channel ${index + 1}`;
          // For manual control, start with current schedule intensity as default
          const defaultBrightness = currentIntensity;

          return `
            <div style="background: var(--gray-50); padding: 12px; border-radius: 6px; border: 1px solid var(--gray-200);">
              <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: 600; color: var(--gray-700);">${channelName}</span>
                <span style="font-size: 14px; font-weight: 700; color: var(--gray-500);" id="channel-value-${index}">-</span>
              </div>
              <div style="margin-bottom: 8px;">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value="${defaultBrightness}"
                  class="channel-slider"
                  data-device="${deviceAddress}"
                  data-channel="${index}"
                  style="width: 100%; height: 6px; border-radius: 3px; background: var(--gray-300); outline: none;"
                  onchange="window.handleChannelBrightnessChange('${deviceAddress}', ${index}, this.value)"
                  oninput="document.getElementById('channel-value-${index}').textContent = this.value + '%'"
                />
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-xs btn-secondary" onclick="window.handleSetChannelBrightness('${deviceAddress}', ${index}, 0)" style="flex: 1;">Off</button>
                <button class="btn btn-xs btn-primary" onclick="window.handleSetChannelBrightness('${deviceAddress}', ${index}, 100)" style="flex: 1;">Max</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div style="margin-top: 12px; padding: 8px 12px; background: var(--gray-100); border-radius: 4px; font-size: 11px; color: var(--gray-600);">
        💡 <strong>Note:</strong> Individual channel values are not reported by the device. Use manual controls above to set specific channel brightness levels.
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

  // Create combined date/time display
  const dateTimeDisplay = currentTime !== 'Unknown' && weekdayName !== 'Unknown'
    ? formatDateTime(parsed.hour, parsed.minute, parsed.weekday)
    : 'Unknown';

  const heads = parsed.heads || [];

  // Count active heads: status != 4 (Disabled)
  // Head status: {0,1,2,3,4} = {Daily, 24 Hourly, Custom, Timer, Disabled}
  const activeHeads = heads.filter((head: any) => head.mode !== 4).length;

  // Find the saved configuration for this device
  const savedConfig = doserConfigs.find(config => config.id === device.address);

  return `
    <div style="padding: 16px; background: var(--gray-50);">
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Time</div>
          <div style="font-size: 16px; font-weight: 700, color: var(--gray-900);">${dateTimeDisplay}</div>
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
 * Format schedule days for display
 */
function formatScheduleDays(weekdays: number[] | undefined): string {
  if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) return 'Not Set';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const validDays = weekdays.filter(day => typeof day === 'number' && day >= 0 && day <= 6);

  if (validDays.length === 0) return 'Not Set';

  const sortedDays = [...validDays].sort();

  // Check for everyday (all 7 days)
  if (sortedDays.length === 7) return 'Everyday';

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
function getHeadConfigData(headIndex: number, savedConfig: DoserDevice | undefined): { setDose: string; schedule: string } {
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
    switch (schedule.mode) {
      case 'single':
        setDose = `${(schedule.dailyDoseMl || 0).toFixed(1)}ml`;
        break;
      case 'timer':
        const doses = schedule.doses || [];
        const totalMl = doses.reduce((sum: number, dose: any) => sum + (dose.quantityMl || 0), 0);
        setDose = `${totalMl.toFixed(1)}ml`;
        break;
      case 'every_hour':
        setDose = `${(schedule.dailyDoseMl || 0).toFixed(1)}ml`;
        break;
      default:
        setDose = 'N/A';
    }
  }

  // Format schedule days
  const scheduleText = formatScheduleDays(configHead.recurrence?.days);

  return { setDose, schedule: scheduleText };
}

/**
 * Render pump heads grid
 */
/**
 * Get the configured name for a doser head
 */
function getDoserHeadName(deviceAddress: string, headIndex: number): string | null {
  const metadata = doserMetadata.find(m => m.id === deviceAddress);
  return metadata?.headNames?.[headIndex] || null;
}

/**
 * Get the lifetime total for a doser head
 */
function getHeadLifetimeTotal(headIndex: number, deviceAddress?: string): string {
  if (!deviceAddress || !deviceStatus || !deviceStatus[deviceAddress]) {
    return 'N/A';
  }

  const device = deviceStatus[deviceAddress];
  const parsed = device.parsed as any;

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
    return `${(totalMl / 1000).toFixed(1)}L`;
  }

  return `${totalMl.toFixed(1)}ml`;
}

function renderPumpHeads(heads: any[], savedConfig?: DoserDevice, deviceAddress?: string): string {
  // Always show 4 heads (standard for doser devices)
  // Combine device status data with configuration data
  const allHeads = [];

  for (let i = 0; i < 4; i++) {
    const headIndex = i + 1; // 1-based indexing for display
    // Device heads array is 0-based, so heads[i] corresponds to head number i+1
    const deviceHead = heads[i] || {
      mode_label: 'disabled',
      hour: 0,
      minute: 0,
      dosed_tenths_ml: 0
    };

    const configData = getHeadConfigData(headIndex, savedConfig);

    allHeads.push({ ...deviceHead, index: headIndex, configData });
  }

  return `
    <div style="background: white; padding: 16px; border-radius: 6px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 12px;">Pump Heads</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        ${allHeads.map((head: any) => {
          // Use the device status mode_label as the source of truth for head state
          const displayMode = head.mode_label || 'disabled';
          const isActive = displayMode?.toLowerCase() !== 'disabled';

          // Get the configured head name
          const headName = deviceAddress ? getDoserHeadName(deviceAddress, head.index) : null;

          return `
            <div style="padding: 12px; background: ${isActive ? 'var(--success-light)' : 'var(--gray-50)'}; border: 1px solid ${isActive ? 'var(--success)' : 'var(--gray-200)'}; border-radius: 6px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: ${isActive ? 'var(--success)' : 'var(--gray-300)'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">
                  ${head.index}
                </div>
                <div style="flex: 1;">
                  <div style="font-size: 12px; font-weight: 600; color: ${isActive ? 'var(--success)' : 'var(--gray-500)'}; text-transform: capitalize;">
                    ${displayMode}${headName ? ` → ${headName}` : ''}
                  </div>
                </div>
              </div>
              ${isActive ? `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--gray-600); margin-bottom: 4px;">
                  <span>Time: <strong style="color: var(--gray-900);">${String(head.hour || 0).padStart(2, '0')}:${String(head.minute || 0).padStart(2, '0')}</strong></span>
                  <span>Set: <strong style="color: var(--gray-900);">${head.configData.setDose}</strong></span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--gray-600); margin-bottom: 4px;">
                  <span>Today: <strong style="color: var(--gray-900);">${head.dosed_tenths_ml ? (head.dosed_tenths_ml / 10).toFixed(1) : '0.0'}ml</strong></span>
                  <span>Schedule: <strong style="color: var(--gray-900);">${head.configData.schedule}</strong></span>
                </div>
                <div style="font-size: 10px; color: var(--gray-500); text-align: center; padding-top: 4px; border-top: 1px solid var(--gray-200);">
                  Lifetime: <strong>${getHeadLifetimeTotal(head.index, deviceAddress)}</strong>
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
  // Device-specific controls removed - use the main Configure button instead
  // All device control functionality is accessible through the configuration interface
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
 * Format time and weekday into a readable format like "2:42 PM Wednesday"
 */
function formatDateTime(hour: number, minute: number, weekday: number): string {
  // Convert 24-hour to 12-hour format
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const timeStr = `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;

  const weekdayName = getWeekdayName(weekday);
  return `${timeStr} ${weekdayName}`;
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
        <h2 class="empty-state-title">No Saved Settings Found</h2>
        <p class="empty-state-text">
          Start by scanning for devices or connecting to a device to create a configuration.
        </p>
        <button class="btn btn-primary" onclick="window.handleScanDevices()" ${isScanning ? 'disabled' : ''}>
          ${isScanning ? 'Scanning...' : 'Scan for Devices'}
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
 * Render the unified devices tab - shows all connected devices with their configurations
 */
function renderDevicesTab(): string {
  // Get all connected devices from device status
  const connectedDevices = deviceStatus ? Object.entries(deviceStatus) : [];

  if (connectedDevices.length === 0) {
    return `
      <div class="empty-state">
        <h2 class="empty-state-title">No Connected Devices</h2>
        <p class="empty-state-text">
          Use the "Scan Devices" button in the header to find and connect devices for configuration and management.
        </p>
      </div>
    `;
  }

  const totalDevices = connectedDevices.length;
  const devicesWithConfigs = connectedDevices.filter(([address, status]) => {
    if (status.device_type === 'doser') {
      return doserConfigs.some(d => d.id === address);
    } else if (status.device_type === 'light') {
      return lightConfigs.some(l => l.id === address);
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
function renderConnectedDeviceCard(address: string, status: CachedStatus): string {
  const deviceType = status.device_type;
  const modelName = status.model_name || 'Unknown Model';
  const isConnected = status.connected;
  const lastUpdated = new Date(status.updated_at * 1000);

  // Check if device has a configuration
  let hasConfig = false;
  let configCount = 0;
  let deviceConfig: DoserDevice | LightDevice | null = null;

  if (deviceType === 'doser') {
    deviceConfig = doserConfigs.find(d => d.id === address) || null;
    hasConfig = !!deviceConfig;
    configCount = deviceConfig?.configurations?.length || 0;
  } else if (deviceType === 'light') {
    deviceConfig = lightConfigs.find(l => l.id === address) || null;
    hasConfig = !!deviceConfig;
    configCount = deviceConfig?.configurations?.length || 0;
  }

  const formatDateTime = (date: Date) => {
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
    <div class="card ${isConnected ? 'device-connected' : 'device-disconnected'}">
      <div class="card-header">
        <h3 class="card-title">
          ${deviceConfig?.name || `${modelName} ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}`}
        </h3>
        <div class="card-actions">
          <button class="btn-icon" title="Configure Server Settings (Name, Head Names)" onclick="window.handleConfigureDevice('${address}', '${deviceType}')">Configure</button>
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
          <button class="btn-icon" title="Configure" onclick="window.handleConfigureDoser('${doser.id}')">Configure</button>
          <button class="btn-icon" title="Delete" onclick="window.handleDeleteDoser('${doser.id}')">Delete</button>
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
          <strong>Active Config:</strong> ${activeConfig}
        </div>
        ${doser.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Updated: ${formatDateTime(doser.updatedAt)}</div>` : ''}
        ${doser.createdAt && !doser.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Created: ${formatDateTime(doser.createdAt)}</div>` : ''}
      </div>
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
          <button class="btn-icon" title="Configure" onclick="window.handleConfigureLight('${light.id}')">Configure</button>
          <button class="btn-icon" title="Delete" onclick="window.handleDeleteLight('${light.id}')">Delete</button>
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
          <strong>Active Config:</strong> ${activeConfig}
        </div>
        ${light.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Updated: ${formatDateTime(light.updatedAt)}</div>` : ''}
        ${light.createdAt && !light.updatedAt ? `<div style="font-size: 12px; color: var(--gray-500);">Created: ${formatDateTime(light.createdAt)}</div>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render the dev tab - shows raw payload data for debugging
 */
function renderDevTab(): string {
  const devices = deviceStatus ? Object.entries(deviceStatus).map(([address, status]) => ({
    ...status,
    address
  })) : [];

  return `
    <div style="display: flex; flex-direction: column; gap: 24px;">
      <!-- LED Wattage Calculator -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">WRGB Pro II Wattage Calculator</h2>
          <div class="badge badge-info">Dev Tool</div>
        </div>
        <div style="padding: 20px;">
          ${renderWattageCalculator()}
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--gray-200);">
            <p style="margin: 0 0 8px 0; color: var(--gray-700);">
              <strong>Advanced Testing:</strong> For comprehensive algorithm validation against 16 test cases
            </p>
            <a href="/percentages-test.html"
               target="_blank"
               style="display: inline-block; padding: 8px 16px; background: var(--blue-600); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
              🧪 Open Percentages Test Suite
            </a>
          </div>
        </div>
      </div>

      <!-- Raw Device Data -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Raw Device Data</h2>
          <div class="badge badge-info">${devices.length}</div>
        </div>
      </div>

      ${devices.length === 0 ? `
        <div class="empty-state">
          <h2 class="empty-state-title">No Connected Devices</h2>
          <p class="empty-state-text">Connect to devices to see raw payload data for debugging.</p>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 24px;">
          ${devices.map(device => renderDeviceRawData(device)).join("")}
        </div>
      `}
    </div>
  `;
}

/**
 * Render raw data for a single device
 */
function renderDeviceRawData(device: CachedStatus & { address: string }): string {
  const lastUpdate = device.updated_at ? new Date(device.updated_at * 1000).toLocaleString() : 'Unknown';

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">
          ${device.model_name || 'Unknown Device'}
          <span style="font-weight: normal; color: var(--gray-500);">(${device.device_type})</span>
        </h3>
        <div class="badge ${device.connected ? 'badge-success' : 'badge-gray'}">
          ${device.connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div style="padding: 20px;">
        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--gray-500); margin-bottom: 4px;">DEVICE ADDRESS</div>
          <div style="font-family: monospace; font-size: 14px; color: var(--gray-900);">${device.address}</div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--gray-500); margin-bottom: 4px;">LAST UPDATE</div>
          <div style="font-size: 14px; color: var(--gray-900);">${lastUpdate}</div>
        </div>

        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--gray-500); margin-bottom: 8px;">RAW PAYLOAD (HEX)</div>
          <div style="
            background: var(--gray-50);
            border: 1px solid var(--gray-200);
            border-radius: 6px;
            padding: 12px;
            font-family: monospace;
            font-size: 12px;
            word-break: break-all;
            line-height: 1.4;
            color: var(--gray-800);
          ">
            ${device.raw_payload || 'No raw payload data'}
          </div>
        </div>

        <div>
          <div style="font-size: 12px; font-weight: 600; color: var(--gray-500); margin-bottom: 8px;">DECODED JSON</div>
          <div style="
            background: var(--gray-50);
            border: 1px solid var(--gray-200);
            border-radius: 6px;
            padding: 12px;
            font-family: monospace;
            font-size: 12px;
            line-height: 1.4;
            color: var(--gray-800);
          ">
            <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(device.parsed || {}, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render LED wattage calculator for testing light configurations
 */
function renderWattageCalculator(): string {
  return `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <!-- Calculator Input -->
      <div>
        <h3 style="margin: 0 0 16px 0; color: var(--gray-900);">Channel Intensity</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 16px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">Red (%)</label>
            <input type="number"
                   id="watt-red"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">Green (%)</label>
            <input type="number"
                   id="watt-green"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">Blue (%)</label>
            <input type="number"
                   id="watt-blue"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">White (%)</label>
            <input type="number"
                   id="watt-white"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
        </div>
      </div>

      <!-- Results -->
      <div id="wattage-results" style="
        background: var(--gray-50);
        border: 1px solid var(--gray-200);
        border-radius: 8px;
        padding: 20px;
      ">
        <!-- Results will be populated by calculateWattageFromInputs() -->
      </div>

      <!-- Test Cases -->
      <div>
        <h3 style="margin: 0 0 16px 0; color: var(--gray-900);">Test Cases</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
          <button onclick="window.setWattageTestCase(0, 0, 0, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Off</strong><br>
            R:0% G:0% B:0% W:0%
          </button>
          <button onclick="window.setWattageTestCase(50, 50, 50, 50)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>50% All</strong><br>
            R:50% G:50% B:50% W:50%
          </button>
          <button onclick="window.setWattageTestCase(100, 100, 100, 100)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>100% All</strong><br>
            R:100% G:100% B:100% W:100%
          </button>
          <button onclick="window.setWattageTestCase(139, 139, 137, 140)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Maximum</strong><br>
            R:139% G:139% B:137% W:140%
          </button>
          <button onclick="window.setWattageTestCase(100, 0, 0, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Red Only</strong><br>
            R:100% G:0% B:0% W:0%
          </button>
          <button onclick="window.setWattageTestCase(0, 100, 0, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Green Only</strong><br>
            R:0% G:100% B:0% W:0%
          </button>
          <button onclick="window.setWattageTestCase(0, 0, 100, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Blue Only</strong><br>
            R:0% G:0% B:100% W:0%
          </button>
          <button onclick="window.setWattageTestCase(0, 0, 0, 100)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>White Only</strong><br>
            R:0% G:0% B:0% W:100%
          </button>
        </div>
      </div>

      <!-- Device Specifications -->
      <div style="
        background: var(--blue-50);
        border: 1px solid var(--blue-200);
        border-radius: 8px;
        padding: 16px;
      ">
        <h4 style="margin: 0 0 8px 0; color: var(--blue-900);">Device Specifications</h4>
        <p style="margin: 4px 0; color: var(--blue-800);"><strong>Actual Maximum Wattage:</strong> ${formatWattage(getMaxWattage())} (power supply limited)</p>
        <p style="margin: 4px 0; color: var(--blue-800);"><strong>Theoretical Maximum:</strong> ${formatWattage(getTheoreticalMaxWattage())} (if no power limiting)</p>
        <p style="margin: 4px 0; color: var(--blue-800);"><strong>Model:</strong> WRGB Pro II</p>
        <p style="margin: 4px 0 0 0; color: var(--blue-800);"><strong>Power Limiting:</strong> Channels scaled down proportionally when total exceeds 138W</p>
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
    // Load configurations, metadata, and device status in parallel
    const results = await Promise.allSettled([
      getDoserConfigurations(),
      getLightConfigurations(),
      getConfigurationSummary(),
      getDeviceStatus(),
      listDoserMetadata(),
      listLightMetadata(),
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

    // Handle doser metadata
    if (results[4].status === "fulfilled") {
      doserMetadata = results[4].value;
    } else {
      console.error("❌ Failed to load doser metadata:", results[4].reason);
      doserMetadata = [];
    }

    // Handle light metadata
    if (results[5].status === "fulfilled") {
      lightMetadata = results[5].value;
    } else {
      console.error("❌ Failed to load light metadata:", results[5].reason);
      lightMetadata = [];
    }

    console.log("✅ Loaded data:", {
      dosers: doserConfigs.length,
      lights: lightConfigs.length,
      devices: Object.keys(deviceStatus || {}).length,
      doserMetadata: doserMetadata.length,
      lightMetadata: lightMetadata.length,
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
  // Render notifications after dashboard update
  renderNotifications();
}

// ============================================================================
// Global Event Handlers
// ============================================================================

// Initialize global handlers BEFORE loading data
(window as any).switchTab = async (tab: "overview" | "devices" | "dev") => {
  currentTab = tab;
  refreshDashboard();
};

(window as any).handleRefreshAll = async () => {
  const { addNotification } = useActions();

  try {
    await loadAllConfigurations();
    addNotification({
      type: 'success',
      message: 'All device configurations refreshed successfully'
    });
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to refresh configurations: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleScanDevices = async () => {
  if (isScanning) return; // Prevent double scan

  // Show scan modal instead of redirecting to overview tab
  showScanDevicesModal();
};

/**
 * Show the device scanning modal with live scan progress
 */
function showScanDevicesModal(): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'scan-modal';

  const renderModalContent = () => {
    const connectedAddresses = deviceStatus ? Object.keys(deviceStatus) : [];
    const newDevices = scanResults.filter(device => !connectedAddresses.includes(device.address));

    if (isScanning) {
      return `
        <div class="modal-content" style="max-width: 90vw; width: 500px;">
          <div class="modal-header">
            <h2>🔄 Scanning for Devices...</h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
          </div>
          <div class="modal-body" style="text-align: center; padding: 40px;">
            <div class="scan-spinner" style="font-size: 48px; margin-bottom: 20px;">🔄</div>
            <p>Searching for nearby BLE devices. This may take a few seconds.</p>
          </div>
        </div>
      `;
    }

    if (scanResults.length > 0) {
      if (newDevices.length === 0) {
        return `
          <div class="modal-content" style="max-width: 90vw; width: 500px;">
            <div class="modal-header">
              <h2>No New Devices Found</h2>
              <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 40px;">
              <p>Found ${scanResults.length} device${scanResults.length !== 1 ? 's' : ''}, but they are already connected.</p>
              <div style="margin-top: 20px;">
                <button class="btn btn-secondary" onclick="window.startModalScan()" style="margin-right: 10px;">
                  Scan Again
                </button>
                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();">
                  Close
                </button>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="modal-content" style="max-width: 95vw; width: fit-content; min-width: 600px;">
          <div class="modal-header">
            <h2>Discovered Devices</h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom: 20px;">Found ${newDevices.length} new device${newDevices.length !== 1 ? 's' : ''}. Click "Connect" to add them to your dashboard.</p>
            <div class="scan-results-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; max-width: 100%;">
              ${newDevices.map(device => renderScanResultCard(device)).join("")}
            </div>
            <div style="margin-top: 20px; text-align: center;">
              <button class="btn btn-secondary" onclick="window.startModalScan()" style="margin-right: 10px;">
                Scan Again
              </button>
              <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();">
                Close
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="modal-content" style="max-width: 90vw; width: 500px;">
        <div class="modal-header">
          <h2>Scan for Devices</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
        </div>
        <div class="modal-body" style="text-align: center; padding: 40px;">
          <p style="margin-bottom: 20px;">Search for nearby BLE devices to add to your dashboard.</p>
          <button class="btn btn-primary" onclick="window.startModalScan()">
            Start Scanning
          </button>
        </div>
      </div>
    `;
  };

  modal.innerHTML = renderModalContent();
  document.body.appendChild(modal);

  // Set up modal refresh function
  (window as any).refreshScanModal = () => {
    const existingModal = document.getElementById('scan-modal');
    if (existingModal) {
      existingModal.innerHTML = renderModalContent();
    }
  };
}

// Function to start scanning from within the modal
(window as any).startModalScan = async () => {
  if (isScanning) return;

  try {
    isScanning = true;
    scanResults = []; // Clear previous results
    (window as any).refreshScanModal(); // Update modal to show scanning state

    const results = await scanDevices();
    scanResults = results;
  } catch (err) {
    scanResults = [];
    const { addNotification } = useActions();
    addNotification({
      type: 'error',
      message: `Failed to scan for devices: ${err instanceof Error ? err.message : String(err)}`
    });
  } finally {
    isScanning = false;
    (window as any).refreshScanModal(); // Update modal with results
  }
};

(window as any).handleConnectDevice = async (address: string) => {
  try {
    // Update UI to show connecting state
    const button = document.querySelector(`button[onclick*="${address}"]`) as HTMLButtonElement;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span>🔄</span> Connecting...';
    }

    await connectDevice(address);

    // Refresh device status to show the newly connected device
    await loadAllConfigurations();

    // Update button to show connected state
    if (button) {
      button.innerHTML = '<span>✅</span> Connected';
      button.disabled = true;
      button.classList.remove('btn-primary');
      button.classList.add('btn-success');
    }

    // Close scan modal if it's open and device connected successfully
    // REMOVED: Don't auto-close scan modal to allow connecting multiple devices
    // const scanModal = document.getElementById('scan-modal');
    // if (scanModal) {
    //   scanModal.remove();
    // }

    // Force refresh the dashboard to show the new device
    refreshDashboard();

    // Also refresh the scan modal if it's open to update the display
    if ((window as any).refreshScanModal) {
      (window as any).refreshScanModal();
    }

  } catch (err) {
    // Show error state on button, but no popup
    const button = document.querySelector(`button[onclick*="${address}"]`) as HTMLButtonElement;
    if (button) {
      button.innerHTML = '<span>❌</span> Failed';
      button.disabled = false;
      button.classList.remove('btn-primary');
      button.classList.add('btn-danger');

      // Reset button after 3 seconds
      setTimeout(() => {
        button.innerHTML = '<span>🔌</span> Retry';
        button.classList.remove('btn-danger');
        button.classList.add('btn-primary');
      }, 3000);
    }
  }
};

// Clear scan results
(window as any).clearScanResults = () => {
  scanResults = [];
  refreshDashboard();
};

// Generic handler for configuring any device type
(window as any).handleConfigureDevice = async (address: string, deviceType: string) => {
  if (deviceType === 'doser') {
    try {
      const { getDoserConfiguration } = await import("../api/configurations");
      const device = await getDoserConfiguration(address);
      showDoserServerConfigModal(device);
    } catch (err) {
      // If no config exists, create a new one for configuration
      console.log(`No existing doser configuration for ${address}, opening new server configuration interface`);
      showDoserServerConfigModal({
        id: address,
        name: `Doser ${address.slice(-8)}`,
        configurations: [],
        activeConfigurationId: undefined,
        timezone: 'UTC'
      });
    }
  } else if (deviceType === 'light') {
    try {
      const { getLightConfiguration } = await import("../api/configurations");
      const device = await getLightConfiguration(address);
      showLightConfigurationModal(device);
    } catch (err) {
      // If no config exists, create a new one for configuration
      console.log(`No existing light configuration for ${address}, opening new configuration interface`);
      showLightConfigurationModal({
        id: address,
        name: `Light ${address.slice(-8)}`,
        timezone: 'UTC',
        channels: [],
        configurations: [],
        activeConfigurationId: undefined
      });
    }
  }
};

// Handler for device settings (command/schedule interface)
(window as any).handleDeviceSettings = async (address: string, deviceType: string) => {
  if (deviceType === 'doser') {
    try {
      const { getDoserConfiguration } = await import("../api/configurations");
      const device = await getDoserConfiguration(address);
      showDoserDeviceSettingsModal(device);
    } catch (err) {
      // If no config exists, create a new one for settings
      console.log(`No existing doser configuration for ${address}, opening new device settings interface`);
      showDoserDeviceSettingsModal({
        id: address,
        name: `Doser ${address.slice(-8)}`,
        configurations: [],
        activeConfigurationId: undefined,
        timezone: 'UTC'
      });
    }
  } else if (deviceType === 'light') {
    // For lights, use the device settings modal for commands
    try {
      const { getLightConfiguration } = await import("../api/configurations");
      const device = await getLightConfiguration(address);
      showLightDeviceSettingsModal(device);
    } catch (err) {
      console.log(`No existing light configuration for ${address}, opening new device settings interface`);
      showLightDeviceSettingsModal({
        id: address,
        name: `Light ${address.slice(-8)}`,
        timezone: 'UTC',
        channels: [],
        configurations: [],
        activeConfigurationId: undefined
      });
    }
  }
};

// Generic handler for deleting any device configuration
(window as any).handleDeleteDevice = async (address: string, deviceType: string) => {
  const deviceName = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
  if (confirm(`Are you sure you want to delete the configuration for ${deviceName} ${address}?`)) {
    try {
      if (deviceType === 'doser') {
        const { deleteDoserConfiguration } = await import("../api/configurations");
        await deleteDoserConfiguration(address);
      } else if (deviceType === 'light') {
        const { deleteLightConfiguration } = await import("../api/configurations");
        await deleteLightConfiguration(address);
      }
      await loadAllConfigurations();
    } catch (err) {
      alert(`Failed to delete configuration: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};

// Handler for refreshing individual device status
(window as any).handleRefreshDevice = async (address: string) => {
  const { addNotification } = useActions();

  try {
    const { refreshDeviceStatus } = await import("../api/devices");
    await refreshDeviceStatus(address);
    await loadAllConfigurations(); // Refresh all data
    addNotification({
      type: 'success',
      message: `Device ${address} status refreshed successfully`
    });
  } catch (err) {
    addNotification({
      type: 'error',
      message: `Failed to refresh device status: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

(window as any).handleConfigureLight = async (deviceId: string) => {
  try {
    const { getLightConfiguration } = await import("../api/configurations");
    const device = await getLightConfiguration(deviceId);
    showLightConfigurationModal(device);
  } catch (err) {
    alert(`Failed to load light configuration: ${err instanceof Error ? err.message : String(err)}`);
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

/**
 * Create a device configuration that merges current device status with saved configuration
 * This ensures the configure window shows current device state, not just saved settings
 */
function createDeviceConfigFromStatus(
  deviceId: string,
  currentStatus: CachedStatus | undefined,
  savedDevice: DoserDevice | null
): DoserDevice {
  // Get metadata for device name and head names
  const metadata = doserMetadata.find(m => m.id === deviceId);

  // Base device structure
  const device: DoserDevice = {
    id: deviceId,
    name: metadata?.name || savedDevice?.name || `Doser ${deviceId.slice(-4)}`,
    timezone: savedDevice?.timezone || 'UTC',
    configurations: savedDevice?.configurations || [],
    activeConfigurationId: savedDevice?.activeConfigurationId || undefined
  };

  // If we have current device status, use it to populate head data
  if (currentStatus?.parsed && currentStatus.device_type === 'doser') {
    const parsed = currentStatus.parsed as any;
    const heads = parsed.heads || [];

    // Create a new configuration from current device status if none exists
    if (!device.configurations.length) {
      const newConfig = {
        id: `config-${Date.now()}`,
        name: 'Current Device Settings',
        revisions: [{
          id: `revision-${Date.now()}`,
          timestamp: new Date().toISOString(),
          heads: heads.map((head: any, index: number) => ({
            index: index + 1,
            schedule: head.mode_label !== 'disabled' ? {
              mode: 'single' as const,
              dailyDoseMl: (head.dosed_tenths_ml || 0) / 10,
              hour: head.hour || 0,
              minute: head.minute || 0
            } : null,
            recurrence: head.mode_label !== 'disabled' ? {
              days: [0, 1, 2, 3, 4, 5, 6] // Default to every day
            } : null
          }))
        }]
      };

      device.configurations = [newConfig];
      device.activeConfigurationId = newConfig.id;
    } else {
      // Update existing configuration with current device status
      const activeConfig = device.configurations.find(c => c.id === device.activeConfigurationId);
      if (activeConfig && activeConfig.revisions.length > 0) {
        const latestRevision = activeConfig.revisions[activeConfig.revisions.length - 1];

        // Update head data with current device status
        heads.forEach((head: any, index: number) => {
          const headIndex = index + 1;
          let configHead = latestRevision.heads?.find((h: any) => h.index === headIndex);

          if (!configHead && head.mode_label !== 'disabled') {
            // Add new head if it's active on device but not in config
            if (!latestRevision.heads) latestRevision.heads = [];
            configHead = {
              index: headIndex,
              schedule: null,
              recurrence: null
            };
            latestRevision.heads.push(configHead);
          }

          if (configHead && head.mode_label !== 'disabled') {
            // Update schedule with current device data if head is active
            if (!configHead.schedule) {
              configHead.schedule = {
                mode: 'single' as const,
                dailyDoseMl: (head.dosed_tenths_ml || 0) / 10,
                hour: head.hour || 0,
                minute: head.minute || 0
              };
            }

            if (!configHead.recurrence) {
              configHead.recurrence = {
                days: [0, 1, 2, 3, 4, 5, 6]
              };
            }
          }
        });
      }
    }
  }

  return device;
}

(window as any).handleConfigureDoser = async (deviceId: string) => {
  try {
    const { getDoserConfiguration } = await import("../api/configurations");

    // Get current device status for live data
    const currentDeviceStatus = deviceStatus && deviceStatus[deviceId];

    // Load saved configuration (may be null if none exists)
    let savedDevice: DoserDevice | null = null;
    try {
      savedDevice = await getDoserConfiguration(deviceId);
    } catch (err) {
      // No saved config exists, that's okay
      console.log("No saved configuration found, creating new config from device status");
    }

    // Create a device configuration that merges current status with saved config
    const device = createDeviceConfigFromStatus(deviceId, currentDeviceStatus || undefined, savedDevice);

    showDoserDeviceSettingsModal(device);
  } catch (err) {
    const { addNotification } = useActions();
    addNotification({
      type: 'error',
      message: `Failed to load doser configuration: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

/**
 * Show the doser server configuration modal - for device and head names only
 */
function showDoserServerConfigModal(device: DoserDevice): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h2>Configure Doser</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
      </div>
      <div class="modal-body">
        ${renderDoserServerConfigInterface(device)}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Show the doser device settings modal - for commands and schedules
 */
function showDoserDeviceSettingsModal(device: DoserDevice): void {
  currentConfigDevice = device; // Set global state

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content doser-config-modal" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>Doser Settings: ${device.name || device.id}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove(); currentConfigDevice = null;">×</button>
      </div>
      <div class="modal-body">
        ${renderDoserDeviceSettingsInterface(device)}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      currentConfigDevice = null;
    }
  });
}

function showLightConfigurationModal(device: LightDevice): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content light-config-modal" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>Light Configuration: ${device.name || device.id}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
      </div>
      <div class="modal-body">
        ${renderLightConfigurationForm(device)}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Show the light device settings modal - for commands and controls
 */
function showLightDeviceSettingsModal(device: LightDevice): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content light-settings-modal" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>Light Settings: ${device.name || device.id}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
      </div>
      <div class="modal-body">
        ${renderLightDeviceSettingsInterface(device)}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Render the light configuration form (for device profiles and configurations)
 */
function renderLightConfigurationForm(device: LightDevice): string {
  return `
    <div class="light-config-form">
      <div class="form-section">
        <h3>Device Information</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Device ID:</label>
            <input type="text" value="${device.id}" readonly style="background: #f5f5f5;">
          </div>
          <div class="form-group">
            <label>Name:</label>
            <input type="text" id="light-device-name" value="${device.name || ''}" placeholder="Enter device name">
          </div>
          <div class="form-group">
            <label>Timezone:</label>
            <input type="text" id="light-timezone" value="${device.timezone || 'UTC'}" placeholder="e.g., America/New_York">
          </div>
        </div>
      </div>

      <div class="form-section">
        <h3>Channel Configuration</h3>
        <p class="section-description">Configure the available channels for this light device.</p>
        <div class="channels-container">
          ${renderLightChannels(device.channels || [])}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="window.addLightChannel()">+ Add Channel</button>
      </div>

      <div class="form-section">
        <h3>Active Configuration</h3>
        <div class="form-group">
          <label>Active Configuration:</label>
          <select id="active-config-select">
            <option value="">None</option>
            ${(device.configurations || []).map(config => `
              <option value="${config.id}" ${config.id === device.activeConfigurationId ? 'selected' : ''}>
                ${config.name || config.id}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="window.saveLightConfiguration('${device.id}')">Save Configuration</button>
      </div>
    </div>
  `;
}

/**
 * Render the light device settings interface - for commands and controls
 */
function renderLightDeviceSettingsInterface(device: LightDevice): string {
  // Get device name from metadata, fallback to device.name or default
  const deviceMetadata = lightMetadata.find(m => m.id === device.id);
  const deviceDisplayName = deviceMetadata?.name || device.name || 'Unnamed Light';

  return `
    <div class="light-settings-interface">
      <!-- Device Info Section -->
      <div class="config-section">
        <h3>Device Information</h3>
        <p class="section-description">Send commands directly to the light device for immediate control.</p>

        <div class="device-info-readonly">
          <div class="info-item">
            <span class="info-label">Device Name:</span>
            <span class="info-value">${deviceDisplayName}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Device Address:</span>
            <span class="info-value">${device.id}</span>
          </div>
        </div>
      </div>

      <!-- Tabbed Control Interface -->
      <div class="config-section">
        <div class="tab-interface">
          <div class="tab-nav">
            <button class="tab-button active" onclick="window.switchLightSettingsTab(event, 'manual')">Manual Control</button>
            <button class="tab-button" onclick="window.switchLightSettingsTab(event, 'auto')">Auto Mode</button>
          </div>

          <!-- Manual Control Tab -->
          <div id="manual-tab" class="tab-content active">
            <h3>Manual Controls</h3>
            <p class="section-description">Control light brightness and mode directly.</p>

            <div class="manual-controls">
              <div class="control-group">
                <h4>Basic Controls</h4>
                <div class="button-group">
                  <button class="btn btn-success" onclick="window.handleTurnLightOn('${device.id}')">
                    <span>💡</span> Turn On
                  </button>
                  <button class="btn btn-danger" onclick="window.handleTurnLightOff('${device.id}')">
                    <span>🌙</span> Turn Off
                  </button>
                  <button class="btn btn-secondary" onclick="window.handleSetManualMode('${device.id}')">
                    <span>🎛️</span> Manual Mode
                  </button>
                  <button class="btn btn-secondary" onclick="window.handleEnableAutoMode('${device.id}')">
                    <span>🕐</span> Auto Mode
                  </button>
                </div>
              </div>

              <div class="control-group">
                <h4>Manual Brightness</h4>
                <form id="manual-brightness-form" onsubmit="window.handleManualBrightness(event, '${device.id}')">
                  ${renderChannelBrightnessInputs(device, device.id)}
                  <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Set Brightness</button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <!-- Auto Mode Tab -->
          <div id="auto-tab" class="tab-content">
            <h3>Auto Program Scheduler</h3>
            <p class="section-description">Create and send auto programs that run on the device's internal timer.</p>

            <form id="light-config-form" onsubmit="window.handleAddAutoProgram(event, '${device.id}')">
              <div class="form-grid">
                <div class="form-group">
                  <label for="light-label">Program Label:</label>
                  <input type="text" id="light-label" placeholder="e.g., Daily Cycle" class="form-input">
                </div>
              </div>

              <div class="form-grid">
                <div class="form-group">
                  <label for="sunrise-time">Sunrise Time:</label>
                  <input type="time" id="sunrise-time" value="08:00" class="form-input">
                </div>
                <div class="form-group">
                  <label for="sunset-time">Sunset Time:</label>
                  <input type="time" id="sunset-time" value="20:00" class="form-input">
                </div>
                <div class="form-group">
                  <label for="ramp-minutes">Ramp Time (minutes):</label>
                  <input type="number" id="ramp-minutes" value="30" min="0" max="150" class="form-input">
                </div>
              </div>

              <div class="form-group">
                <label>Channel Brightness (%):</label>
                <div class="brightness-inputs">
                  ${renderChannelBrightnessInputs(device, device.id)}
                </div>
              </div>

              <div class="form-group">
                <label>Active Days:</label>
                <div class="weekday-selector">
                  ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `
                    <label class="weekday-option">
                      <input type="checkbox" value="${day}" checked>
                      <span class="weekday-label">${day}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <div class="form-actions">
                <button type="submit" class="btn btn-success">Add Auto Program</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Advanced Controls Section -->
      <div class="config-section">
        <h3>Advanced Controls</h3>
        <p class="section-description">Advanced device management commands.</p>

        <div class="advanced-controls">
          <button class="btn btn-warning" onclick="window.handleResetAutoSettings('${device.id}')">
            <span>🔄</span> Reset Auto Settings
          </button>
          <button class="btn btn-secondary" onclick="window.handleRefreshDevice('${device.id}')">
            <span>🔄</span> Refresh Status
          </button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove();">
          Close
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the server configuration interface - device and head names only
 */
function renderDoserServerConfigInterface(device: DoserDevice): string {
  // Extract existing head names from configuration if available
  const activeConfig = device.configurations.find(c => c.id === device.activeConfigurationId) || device.configurations[0];
  const latestRevision = activeConfig?.revisions[activeConfig.revisions.length - 1];
  const existingHeads = latestRevision?.heads || [];

  const getHeadName = (index: number) => {
    const head = existingHeads.find((h: any) => h.index === index);
    return head?.label || '';
  };

  return `
    <div class="server-config-interface">
      <!-- Device Name Section -->
      <div class="config-section">
        <h3>Device Information</h3>
        <p class="section-description">Configure the display names for this device and its dosing heads. These settings are saved server-side only.</p>

        <div class="form-group">
          <label for="server-device-name">Device Name:</label>
          <input type="text" id="server-device-name" value="${device.name || ''}"
                 placeholder="Enter custom device name (e.g., 'Main Tank Doser')" class="form-input">
        </div>

        <div class="device-info">
          <div class="detail-label">Device Address:</div>
          <div class="detail-value">${device.id}</div>
        </div>
      </div>

      <!-- Head Names Section -->
      <div class="config-section">
        <h3>Dosing Head Names</h3>
        <p class="section-description">Give descriptive names to each dosing head for easier identification.</p>

        <div class="head-names-grid">
          ${[1, 2, 3, 4].map(headIndex => `
            <div class="head-name-config">
              <label for="head-${headIndex}-name">Head ${headIndex}:</label>
              <input type="text" id="head-${headIndex}-name"
                     value="${getHeadName(headIndex)}"
                     placeholder="e.g., Calcium, Alkalinity, Magnesium"
                     class="form-input">
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove();">
          Cancel
        </button>
        <button class="btn btn-primary" onclick="window.saveDoserServerConfig('${device.id}')">
          Save Configuration
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the device settings interface - commands and schedules only
 */
function renderDoserDeviceSettingsInterface(device: DoserDevice): string {
  const activeConfig = device.configurations.find(c => c.id === device.activeConfigurationId);
  const latestRevision = activeConfig?.revisions[activeConfig.revisions.length - 1];
  const heads = latestRevision?.heads || [];

  // Get device name from metadata, fallback to device.name or default
  const deviceMetadata = doserMetadata.find(m => m.id === device.id);
  const deviceDisplayName = deviceMetadata?.name || device.name || 'Unnamed Device';

  return `
    <div class="doser-config-interface">
      <!-- Device Info Section (Read-only) -->
      <div class="config-section">
        <h3>Device Information</h3>
        <p class="section-description">View device information and configure dosing schedules. Commands will be sent directly to the device.</p>

        <div class="device-info-readonly">
          <div class="info-item">
            <span class="info-label">Device Name:</span>
            <span class="info-value">${deviceDisplayName}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Device Address:</span>
            <span class="info-value">${device.id}</span>
          </div>
        </div>
      </div>

      <!-- Head Selector Section -->
      <div class="config-section">
        <h3>Dosing Heads</h3>
        <p class="section-description">Select a head to configure its schedule and settings. Click "Send Command" to apply changes to the device.</p>

        <div class="heads-grid">
          ${renderHeadSelector(heads)}
        </div>
      </div>

      <!-- Command Interface Section -->
      <div class="config-section">
        <div id="command-interface">
          <div class="no-head-selected">
            <div class="empty-state-icon">🎯</div>
            <h4>No Head Selected</h4>
            <p>Select a dosing head above to configure its schedule and settings.</p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove(); currentConfigDevice = null;">
          Close
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the 4-head visual selector
 */
function renderHeadSelector(heads: any[]): string {
  // Get device from current config device to access its ID for metadata lookup
  const device = currentConfigDevice;
  const deviceMetadata = device ? doserMetadata.find(m => m.id === device.id) : null;

  // Ensure we have all 4 heads
  const allHeads = [];
  for (let i = 1; i <= 4; i++) {
    const existingHead = heads.find(h => h.index === i);
    // Get head name from metadata, fallback to default
    const headName = deviceMetadata?.headNames?.[i] || `Head ${i}`;

    allHeads.push(existingHead || {
      index: i,
      label: headName,
      active: false,
      schedule: { mode: 'single', dailyDoseMl: 10.0, startTime: '09:00' }
    });
  }

  return allHeads.map(head => {
    // Get head name from metadata for display
    const headDisplayName = deviceMetadata?.headNames?.[head.index] || `Head ${head.index}`;

    return `
      <div class="head-selector ${head.active ? 'active' : 'inactive'}"
           onclick="window.selectHead(${head.index})"
           data-head-index="${head.index}">
        <div class="head-icon">
          <div class="head-number">${head.index}</div>
          <div class="head-status ${head.active ? 'active' : 'inactive'}"></div>
        </div>
        <div class="head-info">
          <div class="head-label">${headDisplayName}</div>
          <div class="head-summary">
            ${head.active ?
              `${head.schedule?.dailyDoseMl || 0}ml at ${head.schedule?.startTime || '00:00'}` :
              'Disabled'
            }
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render the command interface for a selected head
 */
function renderHeadCommandInterface(headIndex: number): string {
  const device = currentConfigDevice;
  if (!device) return '';

  const activeConfig = device.configurations.find(c => c.id === device.activeConfigurationId);
  const latestRevision = activeConfig?.revisions[activeConfig.revisions.length - 1];
  const head = latestRevision?.heads.find((h: any) => h.index === headIndex);

  const schedule = head?.schedule || { mode: 'single', dailyDoseMl: 10.0, startTime: '09:00' };
  const recurrence = head?.recurrence || { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };

  // Get head name from metadata
  const deviceMetadata = doserMetadata.find(m => m.id === device.id);
  const headDisplayName = deviceMetadata?.headNames?.[headIndex] || `Head ${headIndex}`;

  return `
    <div class="head-command-interface">
      <div class="command-header">
        <h4>Configure ${headDisplayName}</h4>
        <div class="head-status-indicator ${head?.active ? 'active' : 'inactive'}">
          ${head?.active ? '🟢 Active' : '🔴 Inactive'}
        </div>
      </div>

      <!-- Schedule Configuration -->
      <div class="form-section">
        <h5>Schedule Configuration</h5>

        <div class="form-group">
          <label for="schedule-mode-${headIndex}">Mode:</label>
          <select id="schedule-mode-${headIndex}" class="form-select" onchange="window.updateScheduleModeUI(${headIndex}, this.value)">
            <option value="disabled" ${!head?.active ? 'selected' : ''}>Disabled</option>
            <option value="single" ${schedule.mode === 'single' ? 'selected' : ''}>Daily - Single dose at set time</option>
            <option value="timer" ${schedule.mode === 'timer' ? 'selected' : ''}>Timer - Multiple specific times</option>
            <option value="every_hour" ${schedule.mode === 'every_hour' ? 'selected' : ''}>24 Hour - Hourly dosing</option>
            <option value="custom_periods" ${schedule.mode === 'custom_periods' ? 'selected' : ''}>Custom - Custom time periods</option>
          </select>
        </div>

        <div id="schedule-details-${headIndex}">
          ${renderScheduleDetails(headIndex, schedule)}
        </div>

        <div class="form-group">
          <label>Active Days:</label>
          <div class="weekday-selector">
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `
              <label class="weekday-option">
                <input type="checkbox" value="${day}"
                       ${recurrence.days.includes(day) ? 'checked' : ''}
                       id="weekday-${headIndex}-${day}">
                <span class="weekday-label">${day}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Command Actions -->
      <div class="command-actions">
        <button class="btn btn-success btn-large" onclick="window.sendHeadCommandToDevice(${headIndex})">
          Send Command
        </button>
      </div>
    </div>
  `;
}

/**
 * Render schedule details based on mode
 */
function renderScheduleDetails(headIndex: number, schedule: any): string {
  switch (schedule.mode) {
    case 'single':
      return `
        <div class="schedule-single">
          <div class="schedule-mode-description">
            <p><strong>Daily Mode:</strong> Dose once per day at a specific time</p>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="dose-amount-${headIndex}">Dose Amount (ml):</label>
              <input type="number" id="dose-amount-${headIndex}"
                     value="${schedule.dailyDoseMl || 10}"
                     min="0.1" max="6553.5" step="0.1" class="form-input">
            </div>
            <div class="form-group">
              <label for="dose-time-${headIndex}">Time:</label>
              <input type="time" id="dose-time-${headIndex}"
                     value="${schedule.startTime || '09:00'}"
                     class="form-input">
            </div>
          </div>
        </div>
      `;

    case 'every_hour':
      return `
        <div class="schedule-every-hour">
          <div class="schedule-mode-description">
            <p><strong>24 Hour Mode:</strong> Dose every hour starting at a specific time</p>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="daily-total-${headIndex}">Total Daily Amount (ml):</label>
              <input type="number" id="daily-total-${headIndex}"
                     value="${schedule.dailyDoseMl || 24}"
                     min="0.1" max="6553.5" step="0.1" class="form-input">
            </div>
            <div class="form-group">
              <label for="start-time-${headIndex}">Start Time:</label>
              <input type="time" id="start-time-${headIndex}"
                     value="${schedule.startTime || '08:00'}"
                     class="form-input">
            </div>
          </div>
          <div class="hourly-info">
            <p>Hourly dose: <span id="hourly-dose-${headIndex}">${((schedule.dailyDoseMl || 24) / 24).toFixed(1)}ml</span></p>
            <script>
              document.getElementById('daily-total-${headIndex}').addEventListener('input', function() {
                const daily = parseFloat(this.value) || 0;
                document.getElementById('hourly-dose-${headIndex}').textContent = (daily / 24).toFixed(1) + 'ml';
              });
            </script>
          </div>
        </div>
      `;

    case 'custom_periods':
      return `
        <div class="schedule-custom">
          <div class="schedule-mode-description">
            <p><strong>Custom Mode:</strong> Define custom time periods with different dose frequencies</p>
          </div>
          <div class="form-group">
            <label for="custom-daily-${headIndex}">Total Daily Amount (ml):</label>
            <input type="number" id="custom-daily-${headIndex}"
                   value="${schedule.dailyDoseMl || 10}"
                   min="0.1" max="6553.5" step="0.1" class="form-input">
          </div>
          <div class="custom-periods">
            <h6>Time Periods:</h6>
            <div class="period-list" id="periods-${headIndex}">
              ${renderCustomPeriods(headIndex, schedule.periods || [
                { startTime: '08:00', endTime: '12:00', doses: 2 },
                { startTime: '18:00', endTime: '22:00', doses: 2 }
              ])}
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.addCustomPeriod(${headIndex})">
              + Add Period
            </button>
          </div>
        </div>
      `;

    case 'timer':
      return `
        <div class="schedule-timer">
          <div class="schedule-mode-description">
            <p><strong>Timer Mode:</strong> Specific doses at exact times throughout the day</p>
          </div>
          <div class="timer-doses">
            <h6>Dose Schedule:</h6>
            <div class="dose-list" id="doses-${headIndex}">
              ${renderTimerDoses(headIndex, schedule.doses || [
                { time: '08:00', quantityMl: 2.5 },
                { time: '12:00', quantityMl: 2.5 },
                { time: '16:00', quantityMl: 2.5 },
                { time: '20:00', quantityMl: 2.5 }
              ])}
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.addTimerDose(${headIndex})">
              + Add Dose
            </button>
          </div>
          <div class="timer-summary">
            <p>Total daily: <span id="timer-total-${headIndex}">${calculateTimerTotal(schedule.doses || [])}</span>ml</p>
          </div>
        </div>
      `;

    default:
      return '<div class="schedule-disabled"><p>Head is disabled. Select a mode to configure.</p></div>';
  }
}

/**
 * Helper function to render custom periods
 */
function renderCustomPeriods(headIndex: number, periods: any[]): string {
  return periods.map((period, index) => `
    <div class="period-item" data-period-index="${index}">
      <div class="period-row">
        <div class="form-group">
          <label>Start:</label>
          <input type="time" value="${period.startTime}"
                 class="form-input period-start" data-head="${headIndex}" data-period="${index}">
        </div>
        <div class="form-group">
          <label>End:</label>
          <input type="time" value="${period.endTime}"
                 class="form-input period-end" data-head="${headIndex}" data-period="${index}">
        </div>
        <div class="form-group">
          <label>Doses:</label>
          <input type="number" value="${period.doses}" min="1" max="12"
                 class="form-input period-doses" data-head="${headIndex}" data-period="${index}">
        </div>
        <button type="button" class="btn btn-sm btn-danger" onclick="window.removeCustomPeriod(${headIndex}, ${index})">
          ×
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Helper function to render timer doses
 */
function renderTimerDoses(headIndex: number, doses: any[]): string {
  return doses.map((dose, index) => `
    <div class="dose-item" data-dose-index="${index}">
      <div class="dose-row">
        <div class="form-group">
          <label>Time:</label>
          <input type="time" value="${dose.time}"
                 class="form-input dose-time" data-head="${headIndex}" data-dose="${index}">
        </div>
        <div class="form-group">
          <label>Amount (ml):</label>
          <input type="number" value="${dose.quantityMl}" min="0.1" max="6553.5" step="0.1"
                 class="form-input dose-amount" data-head="${headIndex}" data-dose="${index}"
                 onchange="window.updateTimerTotal(${headIndex})">
        </div>
        <button type="button" class="btn btn-sm btn-danger" onclick="window.removeTimerDose(${headIndex}, ${index})">
          ×
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Helper function to calculate timer total
 */
function calculateTimerTotal(doses: any[]): number {
  return doses.reduce((total, dose) => total + (dose.quantityMl || 0), 0);
}

/**
 * Render light channels configuration
 */
function renderLightChannels(channels: LightChannel[]): string {
  return channels.map((channel, index) => `
    <div class="channel-config" data-channel-index="${index}">
      <div class="channel-header">
        <h5>Channel ${index + 1}</h5>
        <button type="button" class="btn btn-sm btn-danger" onclick="window.removeLightChannel(${index})">Remove</button>
      </div>
      <div class="channel-form">
        <div class="form-group">
          <label>Key:</label>
          <input type="text" value="${channel.key}" onchange="window.updateChannelKey(${index}, this.value)">
        </div>
        <div class="form-group">
          <label>Label:</label>
          <input type="text" value="${channel.label || ''}" onchange="window.updateChannelLabel(${index}, this.value)">
        </div>
        <div class="form-group">
          <label>Min:</label>
          <input type="number" value="${channel.min || 0}" onchange="window.updateChannelMin(${index}, this.value)">
        </div>
        <div class="form-group">
          <label>Max:</label>
          <input type="number" value="${channel.max || 100}" onchange="window.updateChannelMax(${index}, this.value)">
        </div>
        <div class="form-group">
          <label>Step:</label>
          <input type="number" value="${channel.step || 1}" onchange="window.updateChannelStep(${index}, this.value)">
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Render channel brightness inputs for new auto program
 */
function renderChannelBrightnessInputs(device: LightDevice, deviceAddress?: string): string {
  // First try to get actual device status for real channel information
  const actualDeviceAddress = deviceAddress || device.id;
  const deviceStatusInfo = deviceStatus && deviceStatus[actualDeviceAddress];

  let channels = device.channels || [];

  // If we have actual device status with channels, use that
  if (deviceStatusInfo && deviceStatusInfo.channels && deviceStatusInfo.channels.length > 0) {
    channels = deviceStatusInfo.channels.map((ch: any) => ({
      key: ch.name.toLowerCase(),
      label: ch.name.charAt(0).toUpperCase() + ch.name.slice(1),
      min: 0,
      max: 100,
      step: 1
    }));
  }
  // If no channels in configuration or device status, try to derive from device model
  else if (channels.length === 0) {
    // Check device name/model for known multi-channel devices
    const deviceName = (device.name || '').toLowerCase();
    const deviceId = device.id.toLowerCase();
    const modelName = deviceStatusInfo?.model_name?.toLowerCase() || '';

    // Use model name first if available, then fall back to device name/ID
    const nameToCheck = modelName || deviceName || deviceId;

    if (nameToCheck.includes('wrgb') && nameToCheck.includes('pro')) {
      // WRGB II Pro - 4 channels
      channels = [
        { key: 'red', label: 'Red', min: 0, max: 100, step: 1 },
        { key: 'green', label: 'Green', min: 0, max: 100, step: 1 },
        { key: 'blue', label: 'Blue', min: 0, max: 100, step: 1 },
        { key: 'white', label: 'White', min: 0, max: 100, step: 1 }
      ];
    } else if (nameToCheck.includes('wrgb')) {
      // Other WRGB devices - 3 channels
      channels = [
        { key: 'red', label: 'Red', min: 0, max: 100, step: 1 },
        { key: 'green', label: 'Green', min: 0, max: 100, step: 1 },
        { key: 'blue', label: 'Blue', min: 0, max: 100, step: 1 }
      ];
    } else if (nameToCheck.includes('rgb')) {
      // RGB devices - 3 channels
      channels = [
        { key: 'red', label: 'Red', min: 0, max: 100, step: 1 },
        { key: 'green', label: 'Green', min: 0, max: 100, step: 1 },
        { key: 'blue', label: 'Blue', min: 0, max: 100, step: 1 }
      ];
    }
  }

  if (channels.length === 0) {
    return '<div class="channel-input"><label>Brightness (%):</label><input type="number" id="brightness-default" min="0" max="100" value="80"></div>';
  }

  return channels.map((channel, index) => {
    const channelName = channel.label || channel.key || `Ch${index + 1}`;
    const channelId = `brightness-${channel.key || index}`;

    return `
      <div class="channel-input">
        <label>${channelName} (%):</label>
        <input type="number" id="${channelId}" min="0" max="100" value="80" data-channel-key="${channel.key || index}">
      </div>
    `;
  }).join('');
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
        </div>
      </div>

      <div class="form-section">
        <h3>Dosing Heads Configuration</h3>
        <div class="heads-container">
          ${heads.map((head: any, index: number) => renderHeadConfiguration(head, index)).join('')}
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
 * Render an existing auto program with edit/delete controls
 */
function renderAutoProgram(program: any, index: number, deviceId: string): string {
  const enabledDays = program.days || [];
  const daysText = enabledDays.length === 7 ? 'Every day' :
                   enabledDays.length === 0 ? 'No days' :
                   enabledDays.join(', ');

  const channelLevels = program.levels || {};
  const levelsText = Object.entries(channelLevels)
    .map(([channel, level]) => `${channel}: ${level}%`)
    .join(', ') || 'No levels set';

  return `
    <div class="auto-program-item" data-program-index="${index}">
      <div class="program-header">
        <div class="program-title">
          <strong>${program.label || `Program ${index + 1}`}</strong>
          ${program.enabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-gray">Disabled</span>'}
        </div>
        <div class="program-actions">
          <button class="btn-icon" title="Edit" onclick="window.editAutoProgram('${deviceId}', ${index})">Edit</button>
          <button class="btn-icon" title="Remove" onclick="window.removeAutoProgram('${deviceId}', ${index})">Remove</button>
        </div>
      </div>
      <div class="program-details">
        <div class="program-times">
          <span class="time sunrise">🌅 ${program.sunrise || '08:00'}</span>
          <span class="time sunset">🌇 ${program.sunset || '20:00'}</span>
        </div>
        <div class="program-days">${daysText}</div>
        <div class="program-levels">${levelsText}</div>
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
      </div>
    </div>
  `;
}



// ============================================================================
// Doser Configuration Interface Functions
// ============================================================================

let selectedHeadIndex: number | null = null;

(window as any).selectHead = (headIndex: number) => {
  selectedHeadIndex = headIndex;

  // Update UI - highlight selected head
  document.querySelectorAll('.head-selector').forEach(el => {
    el.classList.remove('selected');
  });

  const selectedHead = document.querySelector(`[data-head-index="${headIndex}"]`);
  if (selectedHead) {
    selectedHead.classList.add('selected');
  }

  // Update command interface
  const commandInterface = document.getElementById('command-interface');
  if (commandInterface) {
    commandInterface.innerHTML = renderHeadCommandInterface(headIndex);
  }
};

(window as any).updateScheduleModeUI = (headIndex: number, mode: string) => {
  const scheduleDetails = document.getElementById(`schedule-details-${headIndex}`);
  if (scheduleDetails) {
    let schedule: any = { mode };

    switch (mode) {
      case 'single':
        schedule = { mode: 'single', dailyDoseMl: 10.0, startTime: '09:00' };
        break;
      case 'every_hour':
        schedule = { mode: 'every_hour', dailyDoseMl: 24.0, startTime: '08:00' };
        break;
      case 'custom_periods':
        schedule = {
          mode: 'custom_periods',
          dailyDoseMl: 10.0,
          periods: [
            { startTime: '08:00', endTime: '12:00', doses: 2 },
            { startTime: '18:00', endTime: '22:00', doses: 2 }
          ]
        };
        break;
      case 'timer':
        schedule = {
          mode: 'timer',
          doses: [
            { time: '08:00', quantityMl: 2.5 },
            { time: '12:00', quantityMl: 2.5 },
            { time: '16:00', quantityMl: 2.5 },
            { time: '20:00', quantityMl: 2.5 }
          ]
        };
        break;
      default:
        schedule = { mode: 'disabled' };
    }

    scheduleDetails.innerHTML = renderScheduleDetails(headIndex, schedule);
  }
};

(window as any).sendHeadCommandToDevice = async (headIndex: number) => {
  if (!currentConfigDevice) return;

  try {
    // Get form values
    const mode = (document.getElementById(`schedule-mode-${headIndex}`) as HTMLSelectElement)?.value;

    if (mode === 'disabled') {
      alert('Cannot send command for disabled head. Select a mode first.');
      return;
    }

    let commandArgs: any = {
      head_index: headIndex
    };

    if (mode === 'single') {
      const doseAmount = parseFloat((document.getElementById(`dose-amount-${headIndex}`) as HTMLInputElement)?.value || '10');
      const doseTime = (document.getElementById(`dose-time-${headIndex}`) as HTMLInputElement)?.value || '09:00';

      const [hour, minute] = doseTime.split(':').map(Number);

      commandArgs = {
        ...commandArgs,
        volume_tenths_ml: Math.round(doseAmount * 10), // Convert to tenths
        hour,
        minute
      };
    }

    // Get selected weekdays
    const selectedWeekdays: string[] = [];
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(day => {
      const checkbox = document.getElementById(`weekday-${headIndex}-${day}`) as HTMLInputElement;
      if (checkbox?.checked) {
        selectedWeekdays.push(day);
      }
    });

    if (selectedWeekdays.length > 0) {
      // Convert to PumpWeekday enum format expected by backend
      const weekdayMap: Record<string, string> = {
        'Mon': 'monday',
        'Tue': 'tuesday',
        'Wed': 'wednesday',
        'Thu': 'thursday',
        'Fri': 'friday',
        'Sat': 'saturday',
        'Sun': 'sunday'
      };
      commandArgs.weekdays = selectedWeekdays.map(day => weekdayMap[day]);
    }

    // Send command to device
    const response = await fetch(`/api/devices/${encodeURIComponent(currentConfigDevice.id)}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'set_schedule',
        args: commandArgs
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send command: ${error}`);
    }

    const result = await response.json();

    // Show success message
    alert(`Successfully sent schedule command to Head ${headIndex}!`);

    // Refresh the device data
    await loadAllConfigurations();

    // Close modal and refresh dashboard
    document.querySelector('.modal-overlay')?.remove();
    currentConfigDevice = null;

  } catch (error) {
    console.error('Failed to send head command:', error);
    alert(`Failed to send command: ${error instanceof Error ? error.message : String(error)}`);
  }
};

(window as any).testDoseHead = async (headIndex: number) => {
  if (!currentConfigDevice) return;

  try {
    // For now, we'll implement a simple test dose
    const response = await fetch(`/api/devices/${encodeURIComponent(currentConfigDevice.id)}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'set_schedule',
        args: {
          head_index: headIndex,
          volume_tenths_ml: 5, // 0.5ml test dose
          hour: new Date().getHours(),
          minute: new Date().getMinutes(),
          weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send test dose command');
    }

    alert(`Test dose (0.5ml) sent to Head ${headIndex}!`);

  } catch (error) {
    console.error('Failed to send test dose:', error);
    alert(`Failed to send test dose: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Handler for saving server-side configuration (names only)
(window as any).saveDoserServerConfig = async (deviceId: string) => {
  try {
    const deviceNameInput = document.getElementById('server-device-name') as HTMLInputElement;
    const newDeviceName = deviceNameInput?.value || '';

    // Collect head names
    const headNames: { [key: number]: string } = {};
    for (let i = 1; i <= 4; i++) {
      const headNameInput = document.getElementById(`head-${i}-name`) as HTMLInputElement;
      if (headNameInput?.value.trim()) {
        headNames[i] = headNameInput.value.trim();
      }
    }

    // Create minimal device metadata (names only)
    const currentTime = new Date().toISOString();
    const metadata = {
      id: deviceId,
      name: newDeviceName,
      timezone: 'UTC',
      headNames: Object.keys(headNames).length > 0 ? headNames : null,
      createdAt: currentTime,
      updatedAt: currentTime
    };

    const response = await fetch(`/api/configurations/dosers/${encodeURIComponent(deviceId)}/metadata`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      throw new Error(`Failed to save metadata: ${response.statusText}`);
    }

    const { addNotification } = useActions();
    addNotification({
      type: 'success',
      message: 'Server configuration saved successfully!'
    });
    document.querySelector('.modal-overlay')?.remove();
    await loadAllConfigurations(); // Refresh to show updated names
    refreshDashboard(); // Force refresh the UI to show new names
  } catch (err) {
    const { addNotification } = useActions();
    addNotification({
      type: 'error',
      message: `Failed to save server configuration: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

// Note: saveDoserDeviceSettings function removed - device names are now managed via metadata

// Configuration form helper functions
(window as any).toggleHead = (headIndex: number, active: boolean) => {
  if (!currentConfigDevice) return;

  const head = findHead(headIndex);
  if (head) {
    head.active = active;
    updateFormVisibility();
  }
};

// Note: updateHeadLabel function removed - head names are now read-only from metadata

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

// ============================================================================
// Custom Period and Timer Dose Management Handlers
// ============================================================================

(window as any).addCustomPeriod = (headIndex: number) => {
  const periodsList = document.getElementById(`periods-${headIndex}`);
  if (!periodsList) return;

  const currentPeriods = Array.from(periodsList.querySelectorAll('.period-item')).length;
  const newPeriod = { startTime: '09:00', endTime: '17:00', doses: 1 };

  const newPeriodHtml = renderCustomPeriods(headIndex, [newPeriod]);
  periodsList.insertAdjacentHTML('beforeend', newPeriodHtml);
};

(window as any).removeCustomPeriod = (headIndex: number, periodIndex: number) => {
  const periodItem = document.querySelector(`.period-item[data-period-index="${periodIndex}"]`);
  if (periodItem) {
    periodItem.remove();
  }
};

(window as any).addTimerDose = (headIndex: number) => {
  const dosesList = document.getElementById(`doses-${headIndex}`);
  if (!dosesList) return;

  const newDose = { time: '12:00', quantityMl: 1.0 };
  const newDoseHtml = renderTimerDoses(headIndex, [newDose]);
  dosesList.insertAdjacentHTML('beforeend', newDoseHtml);

  // Update total
  (window as any).updateTimerTotal(headIndex);
};

(window as any).removeTimerDose = (headIndex: number, doseIndex: number) => {
  const doseItem = document.querySelector(`.dose-item[data-dose-index="${doseIndex}"]`);
  if (doseItem) {
    doseItem.remove();
    (window as any).updateTimerTotal(headIndex);
  }
};

(window as any).updateTimerTotal = (headIndex: number) => {
  const doseAmounts = Array.from(document.querySelectorAll(`#doses-${headIndex} .dose-amount`))
    .map((input: any) => parseFloat(input.value) || 0);
  const total = doseAmounts.reduce((sum, amount) => sum + amount, 0);

  const totalElement = document.getElementById(`timer-total-${headIndex}`);
  if (totalElement) {
    totalElement.textContent = total.toFixed(1);
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
    // Note: Device name is now managed through metadata, not editable here
    const { updateDoserConfiguration } = await import("../api/configurations");
    await updateDoserConfiguration(deviceId, currentConfigDevice);

    const { addNotification } = useActions();
    addNotification({
      type: 'success',
      message: 'Configuration saved successfully!'
    });
    await loadAllConfigurations();
    document.querySelector('.modal-overlay')?.remove();
  } catch (err) {
    const { addNotification } = useActions();
    addNotification({
      type: 'error',
      message: `Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

(window as any).sendLightAutoSettingToDevice = async (deviceId: string) => {
  const form = document.getElementById('light-config-form');
  if (!form) return;

  try {
    const { executeCommand } = await import("../api/commands");

    const sunrise = (form.querySelector('#light-sunrise') as HTMLInputElement).value;
    const sunset = (form.querySelector('#light-sunset') as HTMLInputElement).value;
    const ramp_up_minutes = parseInt((form.querySelector('#light-ramp') as HTMLInputElement).value);

    // Collect per-channel brightness values or use default
    const channels: Record<string, number> = {};
    const brightnessInputs = form.querySelectorAll('[id^="brightness-"]') as NodeListOf<HTMLInputElement>;

    if (brightnessInputs.length === 0) {
      // Fallback to old brightness field if present
      const legacyBrightness = form.querySelector('#light-brightness') as HTMLInputElement;
      channels['default'] = legacyBrightness ? parseInt(legacyBrightness.value) : 80;
    } else {
      Array.from(brightnessInputs).forEach(input => {
        const match = input.id.match(/brightness-(.+)/);
        if (match) {
          channels[match[1]] = parseInt(input.value) || 0;
        }
      });
    }

    const dayCheckboxes = form.querySelectorAll('.weekday-selector input:checked') as NodeListOf<HTMLInputElement>;
    const selectedDays = Array.from(dayCheckboxes).map(cb => cb.value);

    const commandRequest = {
      action: 'add_auto_setting',
      args: {
        sunrise,
        sunset,
        channels, // Use per-channel brightness instead of single brightness
        ramp_up_minutes,
        weekdays: convertUiWeekdaysToEnum(selectedDays),
        label: (form.querySelector('#light-label') as HTMLInputElement)?.value || 'Auto Program'
      }
    };

    await executeCommand(deviceId, commandRequest);
    const { addNotification } = useActions();
    addNotification({
      type: 'success',
      message: 'Auto mode schedule sent to device successfully!'
    });
    document.querySelector('.modal-overlay')?.remove();
    await loadAllConfigurations(); // Refresh status
  } catch (err) {
    const { addNotification } = useActions();
    addNotification({
      type: 'error',
      message: `Failed to send auto setting to device: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

// ============================================================================
// Auto Program Management Handlers
// ============================================================================

(window as any).addAutoProgram = async (deviceId: string) => {
  const { addNotification } = useActions();
  addNotification({
    type: 'info',
    message: 'Multi-program auto configuration is being developed. For now, use the single program form below.'
  });
};

(window as any).removeAutoProgram = async (deviceId: string, programIndex: number) => {
  const { addNotification } = useActions();
  addNotification({
    type: 'info',
    message: 'Program management features coming soon. Use "Clear Auto Settings" to remove all programs.'
  });
};

(window as any).clearAllAutoPrograms = async (deviceId: string) => {
  if (!confirm('Are you sure you want to clear all auto programs? This will also clear the device\'s auto settings.')) return;

  try {
    const { executeCommand } = await import("../api/commands");

    await executeCommand(deviceId, {
      action: 'clear_auto_settings',
      args: {}
    });

    const { addNotification } = useActions();
    addNotification({
      type: 'success',
      message: 'Auto settings cleared successfully!'
    });

    document.querySelector('.modal-overlay')?.remove();
    await loadAllConfigurations(); // Refresh status

  } catch (err) {
    const { addNotification } = useActions();
    addNotification({
      type: 'error',
      message: `Failed to clear auto programs: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

(window as any).editAutoProgram = async (deviceId: string, programIndex: number) => {
  const { addNotification } = useActions();
  addNotification({
    type: 'info',
    message: 'Edit functionality coming soon. For now, clear existing programs and add new ones.'
  });
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

    const { addNotification } = useActions();
    addNotification({
      type: 'success',
      message: 'Configuration sent to device successfully!'
    });
  } catch (err) {
    const { addNotification } = useActions();
    addNotification({
      type: 'error',
      message: `Failed to send to device: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

// ============================================================================
// Light Control Handlers
// ============================================================================

(window as any).handleSetManualMode = async (deviceAddress: string) => {
  const { addNotification } = useActions();

  try {
    const { setManualMode } = await import("../api/commands");
    await setManualMode(deviceAddress);

    addNotification({
      type: 'success',
      message: 'Switched to manual mode successfully'
    });

    // Refresh device status to show updated state
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to set manual mode: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleClearAutoSettings = async (deviceAddress: string) => {
  const { addNotification } = useActions();

  try {
    const { resetAutoSettings } = await import("../api/commands");
    await resetAutoSettings(deviceAddress);

    addNotification({
      type: 'success',
      message: 'Auto settings cleared successfully'
    });

    // Refresh device status to show updated state
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to clear auto settings: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleSetChannelBrightness = async (deviceAddress: string, channelIndex: number, brightness: number) => {
  const { addNotification } = useActions();

  try {
    const { sendManualBrightnessCommands } = await import("../api/commands");
    await sendManualBrightnessCommands(deviceAddress, [
      { index: channelIndex, value: brightness }
    ]);

    addNotification({
      type: 'success',
      message: `Channel ${channelIndex + 1} set to ${brightness}%`
    });

    // Refresh device status to show updated brightness
    setTimeout(() => {
      loadAllConfigurations();
    }, 500);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to set channel brightness: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleChannelBrightnessChange = async (deviceAddress: string, channelIndex: number, brightness: string) => {
  // Convert string to number and call the set function
  const brightnessValue = parseInt(brightness, 10);
  if (!isNaN(brightnessValue)) {
    await (window as any).handleSetChannelBrightness(deviceAddress, channelIndex, brightnessValue);
  }
};

// Additional Light Control Handlers for Settings Modal
(window as any).handleTurnLightOn = async (deviceAddress: string) => {
  const { addNotification } = useActions();

  try {
    const { turnLightOn } = await import("../api/commands");
    await turnLightOn(deviceAddress);

    addNotification({
      type: 'success',
      message: 'Light turned on successfully'
    });

    // Refresh device status
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to turn light on: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleTurnLightOff = async (deviceAddress: string) => {
  const { addNotification } = useActions();

  try {
    const { turnLightOff } = await import("../api/commands");
    await turnLightOff(deviceAddress);

    addNotification({
      type: 'success',
      message: 'Light turned off successfully'
    });

    // Refresh device status
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to turn light off: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleEnableAutoMode = async (deviceAddress: string) => {
  const { addNotification } = useActions();

  try {
    const { enableAutoMode } = await import("../api/commands");
    await enableAutoMode(deviceAddress);

    addNotification({
      type: 'success',
      message: 'Auto mode enabled successfully'
    });

    // Refresh device status
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to enable auto mode: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleResetAutoSettings = async (deviceAddress: string) => {
  const { addNotification } = useActions();

  try {
    const { resetAutoSettings } = await import("../api/commands");
    await resetAutoSettings(deviceAddress);

    addNotification({
      type: 'success',
      message: 'Auto settings reset successfully'
    });

    // Refresh device status
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to reset auto settings: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

(window as any).handleManualBrightness = async (event: Event, deviceAddress: string) => {
  event.preventDefault();
  const { addNotification } = useActions();

  try {
    const form = event.target as HTMLFormElement;

    // Get device status to map channel keys to indices
    const deviceStatusInfo = deviceStatus && deviceStatus[deviceAddress];

    // Collect brightness values from all channel inputs
    const brightnessInputs = form.querySelectorAll('input[type="number"]');
    const channels: Record<string, number> = {};

    brightnessInputs.forEach((input) => {
      const inputElement = input as HTMLInputElement;
      const brightness = parseInt(inputElement.value, 10);
      if (!isNaN(brightness)) {
        const channelKey = inputElement.getAttribute('data-channel-key') || '';
        if (channelKey) {
          channels[channelKey] = brightness;
        }
      }
    });

    if (Object.keys(channels).length === 0) {
      addNotification({
        type: 'warning',
        message: 'No valid brightness values found'
      });
      return;
    }

    // Use the new multi-channel brightness command
    const { executeCommand } = await import("../api/commands");
    await executeCommand(deviceAddress, {
      action: "set_multi_channel_brightness",
      args: { channels },
      timeout: 15,
    });

    addNotification({
      type: 'success',
      message: 'Manual brightness set successfully'
    });

    // Refresh device status
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to set manual brightness: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};(window as any).handleAddAutoProgram = async (event: Event, deviceAddress: string) => {
  event.preventDefault();
  const { addNotification } = useActions();

  try {
    const form = event.target as HTMLFormElement;

    // Get form values
    const sunriseTime = (form.querySelector('#sunrise-time') as HTMLInputElement)?.value;
    const sunsetTime = (form.querySelector('#sunset-time') as HTMLInputElement)?.value;
    const rampMinutes = parseInt((form.querySelector('#ramp-minutes') as HTMLInputElement)?.value || '30', 10);
    const label = (form.querySelector('#light-label') as HTMLInputElement)?.value || 'Auto Program';

    // Get channel brightness values
    const brightnessInputs = form.querySelectorAll('.brightness-inputs input[type="number"]');
    const channels: Record<string, number> = {};

    brightnessInputs.forEach((input) => {
      const inputElement = input as HTMLInputElement;
      const brightness = parseInt(inputElement.value, 10);
      if (!isNaN(brightness)) {
        const channelKey = inputElement.getAttribute('data-channel-key') || '';
        if (channelKey) {
          channels[channelKey] = brightness;
        }
      }
    });    // Get selected weekdays
    const dayCheckboxes = form.querySelectorAll('.weekday-selector input:checked') as NodeListOf<HTMLInputElement>;
    const selectedDays = Array.from(dayCheckboxes).map(cb => cb.value);

    // Convert UI weekdays to API format
    const convertUiWeekdaysToEnum = (days: string[]) => {
      const weekdayMap: Record<string, string> = {
        'Mon': 'monday',
        'Tue': 'tuesday',
        'Wed': 'wednesday',
        'Thu': 'thursday',
        'Fri': 'friday',
        'Sat': 'saturday',
        'Sun': 'sunday'
      };
      return days.map(day => weekdayMap[day]).filter(Boolean);
    };

    const { addAutoSetting } = await import("../api/commands");

    await addAutoSetting(deviceAddress, {
      sunrise: sunriseTime,
      sunset: sunsetTime,
      channels,
      ramp_up_minutes: rampMinutes,
      weekdays: convertUiWeekdaysToEnum(selectedDays) as any // Cast to fix type mismatch
    });

    addNotification({
      type: 'success',
      message: 'Auto program added successfully'
    });

    // Close modal and refresh
    document.querySelector('.modal-overlay')?.remove();
    setTimeout(() => {
      loadAllConfigurations();
    }, 1000);
  } catch (error) {
    addNotification({
      type: 'error',
      message: `Failed to add auto program: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

// Light Settings Tab Switching
(window as any).switchLightSettingsTab = (event: Event, tabName: string) => {
  // Remove active class from all tabs and buttons
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  // Add active class to clicked button
  (event.target as HTMLElement).classList.add('active');

  // Show the selected tab content
  const targetTab = document.getElementById(`${tabName}-tab`);
  if (targetTab) {
    targetTab.classList.add('active');
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

  const dayMap: Record<string, string> = {
    'Sun': 'sunday', 'Mon': 'monday', 'Tue': 'tuesday', 'Wed': 'wednesday', 'Thu': 'thursday', 'Fri': 'friday', 'Sat': 'saturday'
  };

  return recurrence.days.map((day: string) => dayMap[day]).filter((s: string | undefined) => s !== undefined);
}

function convertUiWeekdaysToEnum(uiDays: string[]): string[] {
  const dayMap: Record<string, string> = {
    'Mon': 'monday',
    'Tue': 'tuesday',
    'Wed': 'wednesday',
       'Thu': 'thursday',
    'Fri': 'friday',
    'Sat': 'saturday',
    'Sun': 'sunday'
  };
  return uiDays.map(day => dayMap[day]).filter(Boolean);
}

// Global state for the current configuration being edited
let currentConfigDevice: DoserDevice | null = null;

// ============================================================================
// Wattage Calculator Global Functions
// ============================================================================

/**
 * Calculate and display wattage results from input fields
 */
(window as any).calculateWattageFromInputs = () => {
  try {
    const red = parseInt((document.getElementById('watt-red') as HTMLInputElement)?.value || '0');
    const green = parseInt((document.getElementById('watt-green') as HTMLInputElement)?.value || '0');
    const blue = parseInt((document.getElementById('watt-blue') as HTMLInputElement)?.value || '0');
    const white = parseInt((document.getElementById('watt-white') as HTMLInputElement)?.value || '0');

    const result = calculateLightWattage({ red, green, blue, white });
    displayWattageResults(result);
  } catch (error) {
    console.error('Error calculating wattage:', error);
    const resultsEl = document.getElementById('wattage-results');
    if (resultsEl) {
      resultsEl.innerHTML = `<div style="color: red;">Error calculating wattage: ${error}</div>`;
    }
  }
};

/**
 * Set test case values and calculate wattage
 */
(window as any).setWattageTestCase = (red: number, green: number, blue: number, white: number) => {
  const redEl = document.getElementById('watt-red') as HTMLInputElement;
  const greenEl = document.getElementById('watt-green') as HTMLInputElement;
  const blueEl = document.getElementById('watt-blue') as HTMLInputElement;
  const whiteEl = document.getElementById('watt-white') as HTMLInputElement;

  if (redEl) redEl.value = red.toString();
  if (greenEl) greenEl.value = green.toString();
  if (blueEl) blueEl.value = blue.toString();
  if (whiteEl) whiteEl.value = white.toString();

  (window as any).calculateWattageFromInputs();
};

/**
 * Display wattage calculation results
 */
function displayWattageResults(result: WattageCalculationResult) {
  const resultsEl = document.getElementById('wattage-results');
  if (!resultsEl) return;

  resultsEl.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <!-- Total Wattage -->
      <div style="text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: var(--gray-900); margin-bottom: 8px;">
          Total: ${formatWattage(result.totalWattage)}
        </div>
        ${result.powerLimited ? `
          <div style="color: #f59e0b; font-weight: 600; background: #fef3c7; padding: 8px 12px; border-radius: 6px; display: inline-block;">
            ⚠️ Power Limited: Requested ${formatWattage(result.requestedWattage)} but limited to ${formatWattage(result.totalWattage)}
          </div>
        ` : ''}
      </div>

      <!-- Calculation Breakdown -->
      <div>
        <h4 style="margin: 0 0 12px 0; color: var(--gray-900);">Calculation Breakdown</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
          <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
            <div style="color: #fbbf24; font-weight: bold; margin-bottom: 4px;">Step Sum</div>
            <div>${formatWattage(result.stepSum)}</div>
          </div>
          <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
            <div style="color: #a78bfa; font-weight: bold; margin-bottom: 4px;">Embedded Base</div>
            <div>${formatWattage(result.embeddedBaseSum)}</div>
          </div>
          <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
            <div style="color: #34d399; font-weight: bold; margin-bottom: 4px;">Shared Base</div>
            <div>${formatWattage(result.sharedBase)}</div>
          </div>
        </div>
      </div>

      <!-- Individual Channel Wattages -->
      <div>
        <h4 style="margin: 0 0 12px 0; color: var(--gray-900);">Individual Channel Wattages</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
          <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
            <div style="color: #ef4444; font-weight: bold; margin-bottom: 4px;">Red</div>
            <div>${formatWattage(result.channelWattages.red)}</div>
          </div>
          <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
            <div style="color: #22c55e; font-weight: bold; margin-bottom: 4px;">Green</div>
            <div>${formatWattage(result.channelWattages.green)}</div>
          </div>
          <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
            <div style="color: #3b82f6; font-weight: bold; margin-bottom: 4px;">Blue</div>
            <div>${formatWattage(result.channelWattages.blue)}</div>
          </div>
          <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
            <div style="color: #64748b; font-weight: bold; margin-bottom: 4px;">White</div>
            <div>${formatWattage(result.channelWattages.white)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Auto-load configurations on module load (after handlers are registered)
loadAllConfigurations();

// Initialize wattage calculator when dev tab is loaded
setTimeout(() => {
  if (document.getElementById('watt-red')) {
    (window as any).calculateWattageFromInputs();
  }
}, 100);
