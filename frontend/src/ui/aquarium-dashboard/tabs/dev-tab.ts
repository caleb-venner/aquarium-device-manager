/**
 * Dev tab rendering
 */

import { getDashboardState } from "../state";
import { renderWattageCalculator } from "../components/wattage-calculator";

/**
 * Render the dev tab - shows raw payload data for debugging
 */
export function renderDevTab(): string {
  const state = getDashboardState();
  const devices = state.deviceStatus ? Object.entries(state.deviceStatus).map(([address, status]) => ({
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
function renderDeviceRawData(device: any): string {
  const lastUpdate = device.updated_at ? new Date(device.updated_at * 1000).toLocaleString() : 'Unknown';

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${device.model_name || 'Unknown Device'} (${device.address})</h3>
        <div class="badge badge-secondary">${device.device_type}</div>
      </div>
      <div style="padding: 16px;">
        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Last Update</div>
          <div style="font-family: monospace; font-size: 14px; color: var(--gray-700);">${lastUpdate}</div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Connection Status</div>
          <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: ${device.connected ? 'var(--success-light)' : 'var(--gray-100)'}; border-radius: 12px; font-size: 13px; font-weight: 500; color: ${device.connected ? 'var(--success)' : 'var(--gray-600)'};">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${device.connected ? 'var(--success)' : 'var(--gray-400)'};"></span>
            ${device.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        ${device.parsed ? `
          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 8px;">Parsed Data</div>
            <pre style="background: var(--gray-50); padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; margin: 0;">${JSON.stringify(device.parsed, null, 2)}</pre>
          </div>
        ` : `
          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Parsed Data</div>
            <div style="color: var(--gray-500); font-style: italic;">No parsed data available</div>
          </div>
        `}

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 8px;">Raw Status</div>
          <pre style="background: var(--gray-50); padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; margin: 0;">${JSON.stringify(device, null, 2)}</pre>
        </div>
      </div>
    </div>
  `;
}
