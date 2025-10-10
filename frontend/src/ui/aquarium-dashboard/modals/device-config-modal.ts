/**
 * Unified Device Configuration Modal
 * Handles both doser and light device configuration with modern UI
 */

import type { CachedStatus } from "../../../types/models";
import { getDashboardState } from "../state";
import { renderModalConnectionStatus, getConnectionHealth, getConnectionMessage } from "../utils/connection-utils";

/**
 * Show the unified device configuration modal
 */
export function showDeviceConfigModal(deviceAddress: string): void {
  const state = getDashboardState();
  const device = state.deviceStatus?.[deviceAddress];

  if (!device) {
    console.error('Device not found:', deviceAddress);
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';

  // Get current device status for connection info
  const connectionStatus = renderModalConnectionStatus(device, deviceAddress);
  const connectionHealth = getConnectionHealth(device, deviceAddress);
  const connectionMessage = getConnectionMessage(connectionHealth, deviceAddress);

  modal.innerHTML = `
    <div class="modal-content device-config-modal" style="max-width: 700px; max-height: 90vh; overflow-y: auto;" data-device-id="${deviceAddress}">
      <div class="modal-header" style="position: relative; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${connectionStatus}
        </div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
      </div>
      <div class="modal-body">
        ${connectionMessage ? `
          <div class="connection-warning">
            <div class="connection-warning-icon">⚠️</div>
            <div class="connection-warning-text">${connectionMessage}</div>
          </div>
        ` : ''}
        ${renderDeviceConfigInterface(device, deviceAddress)}
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

  // Load current metadata
  loadDeviceMetadata(deviceAddress, device.device_type);
}

/**
 * Render the device configuration interface
 */
function renderDeviceConfigInterface(device: CachedStatus, deviceAddress: string): string {
  return `
    <div class="device-config-interface">
      <!-- Device Information Section -->
      <div class="config-section">
        <h3>Device Information</h3>
        <div class="device-info-grid">
          <div class="info-item">
            <label class="info-label">Device Model Name:</label>
            <span class="info-value model-name">${device.model_name || 'Unknown'}</span>
          </div>
          <div class="info-item">
            <label class="info-label">Device Address:</label>
            <span class="info-value mac-address">${deviceAddress}</span>
          </div>
        </div>
      </div>

      <!-- Device Configuration Section -->
      <div class="config-section">
        <h3>Device Configuration</h3>

        <!-- Auto-Connect Checkbox -->
        <div class="setting-item">
          <div class="setting-header">
            <label class="setting-label" title="Automatically connect to device if available">
              <input type="checkbox" id="auto-connect-checkbox" class="setting-checkbox">
              Auto-Connect
            </label>
          </div>
          <p class="setting-description">Automatically connect to device if available</p>
        </div>

        <!-- Device Nickname -->
        <div class="setting-item">
          <label for="device-nickname" class="setting-label">Device Nickname</label>
          <input type="text" id="device-nickname" class="form-input"
                 placeholder="Enter a custom name for this device">
        </div>

        ${device.device_type === 'doser' ? renderDoserHeadNames() : ''}
      </div>

      <!-- Action Buttons -->
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove();">
          Cancel
        </button>
        <button class="btn btn-primary" onclick="window.saveDeviceConfig('${deviceAddress}')">
          Save Configuration
        </button>
      </div>
    </div>

    <style>
      .device-config-interface {
        padding: 0;
      }

      .config-section {
        margin-bottom: 32px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--border-color);
      }

      .config-section:last-of-type {
        border-bottom: none;
        margin-bottom: 24px;
      }

      .config-section h3 {
        margin: 0 0 16px 0;
        color: var(--text-primary);
        font-size: 18px;
        font-weight: 600;
      }

      .device-info-grid {
        display: grid;
        gap: 12px;
      }

      .info-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
      }

      .info-label {
        font-weight: 600;
        color: var(--text-secondary);
        margin: 0;
      }

      .info-value {
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        color: var(--text-primary);
        font-weight: 500;
      }

      .mac-address {
        font-size: 14px;
        letter-spacing: 0.5px;
      }

      .setting-item {
        margin-bottom: 24px;
      }

      .setting-item:last-child {
        margin-bottom: 0;
      }

      .setting-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }

      .setting-label {
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }

      .setting-checkbox {
        width: 18px;
        height: 18px;
        margin: 0;
        cursor: pointer;
      }

      .setting-description {
        margin: 0;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.4;
        margin-left: 26px;
      }

      .form-input {
        width: 100%;
        padding: 12px 16px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 16px;
        margin-top: 8px;
        transition: border-color 0.2s ease;
      }

      .form-input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.1);
      }

      /* Head names grid for dosers */
      .head-names-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }

      .head-name-item {
        display: flex;
        flex-direction: column;
      }

      .head-name-item label {
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 8px;
        font-size: 14px;
      }
    </style>
  `;
}

/**
 * Render doser head names section
 */
function renderDoserHeadNames(): string {
  return `
    <!-- Dosing Head Names -->
    <div class="setting-item">
      <label class="setting-label">Dosing Head Names</label>
      <div class="head-names-grid">
        ${[1, 2, 3, 4].map(headIndex => `
          <div class="head-name-item">
            <label for="head-${headIndex}-name">Head ${headIndex}</label>
            <input type="text" id="head-${headIndex}-name" class="form-input"
                   placeholder="e.g., Calcium, Alkalinity">
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Load current device metadata and populate the form
 */
async function loadDeviceMetadata(deviceAddress: string, deviceType: string): Promise<void> {
  try {
    let metadata = null;

    if (deviceType === 'doser') {
      const response = await fetch(`/api/configurations/dosers/${encodeURIComponent(deviceAddress)}/metadata`);
      if (response.ok) {
        metadata = await response.json();
      }
    } else if (deviceType === 'light') {
      const response = await fetch(`/api/configurations/lights/${encodeURIComponent(deviceAddress)}/metadata`);
      if (response.ok) {
        metadata = await response.json();
      }
    }

    // Populate form fields
    if (metadata) {
      const nicknameInput = document.getElementById('device-nickname') as HTMLInputElement;
      if (nicknameInput && metadata.name) {
        nicknameInput.value = metadata.name;
      }

      // Load auto-reconnect setting
      const autoConnectCheckbox = document.getElementById('auto-connect-checkbox') as HTMLInputElement;
      if (autoConnectCheckbox) {
        autoConnectCheckbox.checked = metadata.autoReconnect || false;
      }

      // For dosers, populate head nicknames
      if (deviceType === 'doser' && metadata.headNames) {
        for (let i = 1; i <= 4; i++) {
          const headInput = document.getElementById(`head-${i}-name`) as HTMLInputElement;
          if (headInput && metadata.headNames[i]) {
            headInput.value = metadata.headNames[i];
          }
        }
      }
    } else {
      // Default values for new devices
      const autoConnectCheckbox = document.getElementById('auto-connect-checkbox') as HTMLInputElement;
      if (autoConnectCheckbox) {
        autoConnectCheckbox.checked = false;
      }
    }

  } catch (error) {
    console.error('Failed to load device metadata:', error);
  }
}

/**
 * Save device configuration
 */
async function saveDeviceConfig(deviceAddress: string): Promise<void> {
  const state = getDashboardState();
  const device = state.deviceStatus?.[deviceAddress];

  if (!device) {
    console.error('Device not found:', deviceAddress);
    return;
  }

  try {
    // Get form values
    const nicknameInput = document.getElementById('device-nickname') as HTMLInputElement;
    const autoConnectCheckbox = document.getElementById('auto-connect-checkbox') as HTMLInputElement;

    const deviceNickname = nicknameInput?.value.trim() || '';
    const autoConnect = autoConnectCheckbox?.checked || false;

    // Prepare metadata update
    const metadata: any = {
      id: deviceAddress,
      name: deviceNickname || undefined,
      autoReconnect: autoConnect
    };

    // For dosers, collect head nicknames
    if (device.device_type === 'doser') {
      const headNames: { [key: number]: string } = {};
      for (let i = 1; i <= 4; i++) {
        const headInput = document.getElementById(`head-${i}-name`) as HTMLInputElement;
        if (headInput?.value.trim()) {
          headNames[i] = headInput.value.trim();
        }
      }
      if (Object.keys(headNames).length > 0) {
        metadata.headNames = headNames;
      }
    }

    // Update metadata
    let response;
    if (device.device_type === 'doser') {
      response = await fetch(`/api/configurations/dosers/${encodeURIComponent(deviceAddress)}/metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });
    } else if (device.device_type === 'light') {
      response = await fetch(`/api/configurations/lights/${encodeURIComponent(deviceAddress)}/metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });
    }

    if (!response?.ok) {
      throw new Error(`Failed to save metadata: ${response?.statusText}`);
    }

    // Close modal and refresh data
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
      modal.remove();
    }

    // Trigger data refresh
    if (window.refreshDashboardData) {
      await window.refreshDashboardData();
    }

    console.log('Device configuration saved successfully');

  } catch (error) {
    console.error('Failed to save device configuration:', error);
    alert('Failed to save device configuration. Please try again.');
  }
}

// Make functions available globally
declare global {
  interface Window {
    showDeviceConfigModal: (deviceAddress: string) => void;
    saveDeviceConfig: (deviceAddress: string) => Promise<void>;
    refreshDashboardData?: () => Promise<void>;
  }
}

window.showDeviceConfigModal = showDeviceConfigModal;
window.saveDeviceConfig = saveDeviceConfig;
