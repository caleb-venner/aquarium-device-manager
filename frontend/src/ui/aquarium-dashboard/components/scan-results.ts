/**
 * Scan results component
 */

import { getDashboardState, isDeviceConnecting } from "../state";

/**
 * Render the unified scan section (replaces empty state when scanning/results available)
 */
export function renderScanSection(showEmptyState: boolean): string {
  const state = getDashboardState();
  const connectedAddresses = state.deviceStatus ? Object.keys(state.deviceStatus) : [];
  const newDevices = state.scanResults.filter(device => !connectedAddresses.includes(device.address));

  if (state.isScanning) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">🔄 Scanning for Devices...</h2>
        </div>
        <div class="card-body" style="text-align: center; padding: 40px;">
          <div class="scan-spinner" style="font-size: 48px; margin-bottom: 20px;">🔄</div>
          <p>Searching for nearby BLE devices. This may take a few seconds.</p>
        </div>
      </div>
    `;
  }

  if (state.scanResults.length > 0) {
    if (newDevices.length === 0) {
      return `
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Scan Results</h2>
            <div class="badge badge-info">${state.scanResults.length} Found</div>
          </div>
          <div class="card-body" style="text-align: center; padding: 40px;">
            <p>All found devices are already connected to your dashboard.</p>
            <button class="btn btn-secondary" onclick="window.clearScanResults()">
              Clear Results
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">New Devices Found</h2>
          <div class="badge badge-success">${newDevices.length} New</div>
        </div>
        <div class="scan-results-grid">
          ${newDevices.map(device => renderScanResultCard(device)).join("")}
        </div>
        <div class="card-footer" style="text-align: center; padding: 16px; border-top: 1px solid var(--gray-200);">
          <button class="btn btn-secondary" onclick="window.clearScanResults()">
            Clear Results
          </button>
        </div>
      </div>
    `;
  }

  if (showEmptyState) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Device Discovery</h2>
        </div>
        <div class="card-body" style="text-align: center; padding: 40px;">
          <p>Scan for nearby BLE devices to connect them to your dashboard.</p>
          <button class="btn btn-primary" onclick="window.handleScanDevices()">
            <span>📡</span>
            Start Scanning
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
export function renderScanResultCard(device: any): string {
  const connecting = isDeviceConnecting(device.address);
  const buttonId = `connect-btn-${device.address.replace(/:/g, '-')}`;

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
          id="${buttonId}"
          class="btn btn-primary scan-card-button"
          onclick="window.handleConnectDevice('${device.address}')"
          title="Connect to this device and add it to your dashboard"
          ${connecting ? 'disabled' : ''}
        >
          <span>${connecting ? '⏳' : '🔌'}</span>
          ${connecting ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  `;
}
