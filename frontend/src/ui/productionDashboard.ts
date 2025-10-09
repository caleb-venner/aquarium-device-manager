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
  type ConfigurationSummary,
  type DeviceMetadata,
  type LightMetadata,
} from "../api/configurations";
import { getDeviceStatus, scanDevices, connectDevice } from "../api/devices";
import type { StatusResponse, CachedStatus, ScanDevice } from "../types/models";
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

  // Use device.channels for actual channel count, not keyframes.length
  const channelCount = device.channels?.length || keyframes.length;

  return `
    <div style="padding: 16px; background: var(--gray-50);">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Time</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--gray-900);">${dateTimeDisplay}</div>
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
          <div style="font-size: 16px; font-weight: 700; color: var(--gray-900);">${dateTimeDisplay}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Active Heads</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--primary);">${activeHeads}/${heads.length}</div>
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
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--gray-600);">
                  <span>Dosed: <strong style="color: var(--gray-900);">${head.dosed_tenths_ml ? (head.dosed_tenths_ml / 10).toFixed(1) : '0.0'}ml</strong></span>
                  <span>Schedule: <strong style="color: var(--gray-900);">${head.configData.schedule}</strong></span>
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
        <h2 class="empty-state-title">No Configurations Found</h2>
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
          ${hasConfig ? `${configCount} configuration${configCount !== 1 ? 's' : ''}` : 'No configuration'}
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
  await loadAllConfigurations();
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
    alert(`Failed to scan for devices: ${err instanceof Error ? err.message : String(err)}`);
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
    // For lights, use the same configuration modal for now
    try {
      const { getLightConfiguration } = await import("../api/configurations");
      const device = await getLightConfiguration(address);
      showLightConfigurationModal(device);
    } catch (err) {
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
  try {
    const { refreshDeviceStatus } = await import("../api/devices");
    await refreshDeviceStatus(address);
    await loadAllConfigurations(); // Refresh all data
    alert(`Device ${address} status refreshed`);
  } catch (err) {
    alert(`Failed to refresh device status: ${err instanceof Error ? err.message : String(err)}`);
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

(window as any).handleConfigureDoser = async (deviceId: string) => {
  try {
    const { getDoserConfiguration } = await import("../api/configurations");
    const device = await getDoserConfiguration(deviceId);
    showDoserDeviceSettingsModal(device);
  } catch (err) {
    alert(`Failed to load doser configuration: ${err instanceof Error ? err.message : String(err)}`);
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
            <option value="single" ${schedule.mode === 'single' ? 'selected' : ''}>Single Daily Dose</option>
            <option value="timer" ${schedule.mode === 'timer' ? 'selected' : ''}>Multiple Daily Doses</option>
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
          <div class="form-row">
            <div class="form-group">
              <label for="dose-amount-${headIndex}">Dose Amount (ml):</label>
              <input type="number" id="dose-amount-${headIndex}"
                     value="${schedule.dailyDoseMl || 10}"
                     min="0.1" max="999" step="0.1" class="form-input">
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

    case 'timer':
      return `
        <div class="schedule-timer">
          <div class="form-group">
            <label for="total-daily-${headIndex}">Total Daily Amount (ml):</label>
            <input type="number" id="total-daily-${headIndex}"
                   value="${schedule.dailyDoseMl || 10}"
                   min="0.1" max="999" step="0.1" class="form-input">
          </div>
          <div class="form-group">
            <label for="doses-per-day-${headIndex}">Number of Doses per Day:</label>
            <select id="doses-per-day-${headIndex}" class="form-select">
              <option value="2">2 doses</option>
              <option value="3">3 doses</option>
              <option value="4" selected>4 doses</option>
              <option value="6">6 doses</option>
              <option value="8">8 doses</option>
              <option value="12">12 doses</option>
            </select>
          </div>
          <div class="timer-info">
            <p>Doses will be distributed evenly throughout the day</p>
          </div>
        </div>
      `;

    default:
      return '<div class="schedule-disabled"><p>Head is disabled. Select a mode to configure.</p></div>';
  }
}

/**
 * Show the light configuration modal
 */
function showLightConfigurationModal(device: LightDevice): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h2>Configure Light: ${device.name || device.id}</h2>
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
 * Render the light configuration form for auto mode
 */
function renderLightConfigurationForm(device: LightDevice): string {
  // For now, we'll just add a new auto setting.
  // A full implementation would list and allow editing existing settings.
  return `
    <div class="config-form" id="light-config-form">
      <div class="form-section">
        <h3>Add Auto Mode Schedule</h3>
        <p class="form-note">Set a daily schedule for the light to automatically turn on and off.</p>
        <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
          <div class="form-group">
            <label for="light-sunrise">Sunrise Time:</label>
            <input type="time" id="light-sunrise" value="08:00">
          </div>
          <div class="form-group">
            <label for="light-sunset">Sunset Time:</label>
            <input type="time" id="light-sunset" value="20:00">
          </div>
          <div class="form-group">
            <label for="light-brightness">Max Brightness (%):</label>
            <input type="number" id="light-brightness" min="0" max="100" value="80">
          </div>
          <div class="form-group">
            <label for="light-ramp">Ramp-up (minutes):</label>
            <input type="number" id="light-ramp" min="0" value="0">
          </div>
        </div>
        <div class="form-group">
          <label>Active Days:</label>
          <div class="weekday-selector">
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `
              <label class="weekday-label">
                <input type="checkbox" value="${day}" checked><span>${day}</span>
              </label>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-success" onclick="window.sendLightAutoSettingToDevice('${device.id}')">Send to Device</button>
      </div>
    </div>
  `;
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
    if (mode === 'single') {
      schedule = { mode: 'single', dailyDoseMl: 10.0, startTime: '09:00' };
    } else if (mode === 'timer') {
      schedule = { mode: 'timer', dailyDoseMl: 10.0 };
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
      const weekdayMap: { [key: string]: string } = {
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

    alert('Server configuration saved successfully!');
    document.querySelector('.modal-overlay')?.remove();
    await loadAllConfigurations(); // Refresh to show updated names
    refreshDashboard(); // Force refresh the UI to show new names
  } catch (err) {
    alert(`Failed to save server configuration: ${err instanceof Error ? err.message : String(err)}`);
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

    alert('Configuration saved successfully!');
    await loadAllConfigurations();
    document.querySelector('.modal-overlay')?.remove();
  } catch (err) {
    alert(`Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`);
  }
};

(window as any).sendLightAutoSettingToDevice = async (deviceId: string) => {
  const form = document.getElementById('light-config-form');
  if (!form) return;

  try {
    const { executeCommand } = await import("../api/commands");

    const sunrise = (form.querySelector('#light-sunrise') as HTMLInputElement).value;
    const sunset = (form.querySelector('#light-sunset') as HTMLInputElement).value;
    const brightness = parseInt((form.querySelector('#light-brightness') as HTMLInputElement).value);
    const ramp_up_minutes = parseInt((form.querySelector('#light-ramp') as HTMLInputElement).value);

    const dayCheckboxes = form.querySelectorAll('.weekday-selector input:checked') as NodeListOf<HTMLInputElement>;
    const selectedDays = Array.from(dayCheckboxes).map(cb => cb.value);

    const commandRequest = {
      action: 'add_auto_setting',
      args: {
        sunrise,
        sunset,
        brightness,
        ramp_up_minutes,
        weekdays: convertUiWeekdaysToEnum(selectedDays),
      }
    };

    await executeCommand(deviceId, commandRequest);
    alert('Auto mode schedule sent to device successfully!');
    document.querySelector('.modal-overlay')?.remove();
    await loadAllConfigurations(); // Refresh status
  } catch (err) {
    alert(`Failed to send auto setting to device: ${err instanceof Error ? err.message : String(err)}`);
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
