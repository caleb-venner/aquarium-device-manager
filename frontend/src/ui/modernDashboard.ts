// Modern Device Dashboard - Main component
// This will replace the legacy dashboard with proper state management

import { useDevices, useActions, useUI } from "../stores/deviceStore";
import { renderDeviceCard, setupDeviceCardHandlers } from "./modernDeviceCard";
import { setupPolling } from "./polling";
import type { DeviceState } from "../types/models";

let pollingInterval: number | null = null;

export function renderModernDashboard(): string {
  const devices = useDevices();
  const ui = useUI();
  const { refreshDevices, scanForDevices } = useActions();

  // Group devices by type
  const lightDevices = devices.filter(d => d.status.device_type === "light");
  const doserDevices = devices.filter(d => d.status.device_type === "doser");

  return `
    <div class="modern-dashboard">
      <header class="dashboard-header">
        <div class="dashboard-title">
          <h1>Device Dashboard</h1>
          <span class="device-count">${devices.length} device${devices.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="dashboard-actions">
          <button
            class="btn btn-primary refresh-all-btn"
            ${ui.isScanning ? 'disabled' : ''}
            onclick="handleRefreshAll()"
          >
            ${ui.isScanning ? 'Refreshing...' : 'Refresh All'}
          </button>
          <button
            class="btn btn-secondary scan-btn"
            ${ui.isScanning ? 'disabled' : ''}
            onclick="handleScanDevices()"
          >
            ${ui.isScanning ? 'Scanning...' : 'Scan for Devices'}
          </button>
        </div>
      </header>

      ${renderGlobalStatus()}
      ${renderDeviceGrid(lightDevices, doserDevices)}
      ${renderScanResults()}
    </div>
  `;
}

function renderGlobalStatus(): string {
  const ui = useUI();

  if (ui.globalError) {
    return `
      <div class="global-status error">
        <div class="status-icon">⚠️</div>
        <div class="status-content">
          <h3>Connection Error</h3>
          <p>${ui.globalError}</p>
          <button class="btn btn-sm" onclick="handleRetryConnection()">Retry</button>
        </div>
      </div>
    `;
  }

  const devices = useDevices();
  const connectedCount = devices.filter(d => d.status.connected).length;

  if (devices.length === 0) {
    return `
      <div class="global-status empty">
        <div class="status-icon">🔍</div>
        <div class="status-content">
          <h3>No Devices Found</h3>
          <p>Start by scanning for nearby devices or check your Bluetooth connection.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="global-status info">
      <div class="status-icon">📊</div>
      <div class="status-content">
        <h3>System Status</h3>
        <p>${connectedCount} of ${devices.length} devices connected</p>
      </div>
    </div>
  `;
}

function renderDeviceGrid(lightDevices: DeviceState[], doserDevices: DeviceState[]): string {
  if (lightDevices.length === 0 && doserDevices.length === 0) {
    return '';
  }

  return `
    <div class="device-grid">
      ${lightDevices.length > 0 ? `
        <section class="device-section">
          <h2 class="section-title">
            <span class="device-icon">💡</span>
            Light Devices
            <span class="device-badge">${lightDevices.length}</span>
          </h2>
          <div class="device-cards">
            ${lightDevices.map(device => renderDeviceCard(device)).join('')}
          </div>
        </section>
      ` : ''}

      ${doserDevices.length > 0 ? `
        <section class="device-section">
          <h2 class="section-title">
            <span class="device-icon">💊</span>
            Doser Devices
            <span class="device-badge">${doserDevices.length}</span>
          </h2>
          <div class="device-cards">
            ${doserDevices.map(device => renderDeviceCard(device)).join('')}
          </div>
        </section>
      ` : ''}
    </div>
  `;
}

function renderScanResults(): string {
  const ui = useUI();

  if (ui.scanResults.length === 0) {
    return '';
  }

  return `
    <section class="scan-results">
      <h2 class="section-title">
        <span class="device-icon">🔍</span>
        Discovered Devices
        <span class="device-badge">${ui.scanResults.length}</span>
      </h2>
      <div class="scan-cards">
        ${ui.scanResults.map(device => `
          <div class="scan-card">
            <div class="scan-info">
              <h3>${device.name}</h3>
              <p class="address">${device.address}</p>
              <span class="device-type-badge">${device.device_type}</span>
            </div>
            <button
              class="btn btn-primary connect-btn"
              onclick="handleConnectDevice('${device.address}')"
            >
              Connect
            </button>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

// Setup dashboard with polling
export function setupModernDashboard(): void {
  // Start background polling
  pollingInterval = setupPolling();

  // Setup event handlers
  setupDashboardEventHandlers();
  setupDeviceCardHandlers();

  // Initial data load
  const { refreshDevices } = useActions();
  refreshDevices().catch(console.error);
}

// Cleanup dashboard
export function cleanupModernDashboard(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Event handlers
function setupDashboardEventHandlers(): void {
  // Global refresh handler
  (window as any).handleRefreshAll = async () => {
    const { refreshDevices, addNotification } = useActions();
    try {
      await refreshDevices();
      addNotification({
        type: "success",
        message: "All devices refreshed",
        autoHide: true
      });
    } catch (error) {
      addNotification({
        type: "error",
        message: `Refresh failed: ${error}`,
        autoHide: true
      });
    }
  };

  // Scan devices handler
  (window as any).handleScanDevices = async () => {
    const { scanForDevices, addNotification } = useActions();
    try {
      const results = await scanForDevices();
      addNotification({
        type: "success",
        message: `Found ${results.length} device${results.length !== 1 ? 's' : ''}`,
        autoHide: true
      });
    } catch (error) {
      addNotification({
        type: "error",
        message: `Scan failed: ${error}`,
        autoHide: true
      });
    }
  };

  // Connect device handler
  (window as any).handleConnectDevice = async (address: string) => {
    const { connectToDevice } = useActions();
    try {
      await connectToDevice(address);
    } catch (error) {
      console.error(`Failed to connect to ${address}:`, error);
    }
  };

  // Retry connection handler
  (window as any).handleRetryConnection = async () => {
    const { refreshDevices, setGlobalError } = useActions();
    setGlobalError(null);
    try {
      await refreshDevices();
    } catch (error) {
      console.error("Retry failed:", error);
    }
  };
}

// Re-render dashboard when state changes
export function updateDashboardView(): void {
  const container = document.getElementById("modern-dashboard-content");
  if (container) {
    container.innerHTML = renderModernDashboard();
  }
}
