/**
 * Dashboard event handlers
 */

import {
  setScanning,
  setScanResults,
  clearScanResults,
  getDashboardState,
  addConnectingDevice,
  removeConnectingDevice,
  isDeviceConnecting
} from "../state";
import { loadAllDashboardData } from "../services/data-service";
import { scanDevices, connectDevice } from "../../../api/devices";
import { getDoserConfiguration, getLightConfiguration } from "../../../api/configurations";
import { renderScanResultCard } from "../components/scan-results";
import {
  showDoserServerConfigModal,
  showDoserDeviceSettingsModal,
  showLightConfigurationModal,
  showLightDeviceSettingsModal
} from "../modals/device-modals";
import {
  apiToDoserDevice,
  apiToLightDevice,
  createDefaultDoserDevice,
  createDefaultLightDevice
} from "../utils/type-converters";

// Scanning handlers
export async function handleScanDevices(): Promise<void> {
  // Start background scanning immediately
  if (document.querySelector('.scan-spinner')) return; // Prevent double scan

  try {
    setScanning(true);
    clearScanResults();

    // Show scanning notification
    showScanningNotification();

    // Refresh dashboard to show scanning state
    const { refreshDashboard } = await import("../render");
    refreshDashboard();

    const results = await scanDevices();
    setScanResults(results);

    // Hide scanning notification
    hideScanningNotification();

    // Show discovery popup if devices found
    if (results.length > 0) {
      showDeviceDiscoveryPopup(results);
    } else {
      showNoDevicesFoundNotification();
    }
  } catch (err) {
    clearScanResults();
    hideScanningNotification();
    console.error('Failed to scan for devices:', err);
    showScanErrorNotification();
  } finally {
    setScanning(false);
    // Refresh dashboard to remove scanning state
    const { refreshDashboard } = await import("../render");
    refreshDashboard();
  }
}

// Background scanning notification functions
function showScanningNotification(): void {
  // Remove any existing scanning notification
  hideScanningNotification();

  const notification = document.createElement('div');
  notification.id = 'scanning-notification';
  notification.className = 'scanning-notification';
  notification.innerHTML = `
    <div class="scanning-content">
      <div class="scan-spinner"></div>
      <span>Scanning for devices...</span>
    </div>
  `;

  document.body.appendChild(notification);

  // Add styles if not already present
  if (!document.getElementById('scanning-notification-styles')) {
    const styles = document.createElement('style');
    styles.id = 'scanning-notification-styles';
    styles.textContent = `
      .scanning-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideInRight 0.3s ease-out;
      }

      .scanning-content {
        display: flex;
        align-items: center;
        gap: 12px;
        color: var(--text-primary);
        font-weight: 500;
      }

      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }

      .scanning-notification.hiding {
        animation: slideOutRight 0.3s ease-in forwards;
      }
    `;
    document.head.appendChild(styles);
  }
}

function hideScanningNotification(): void {
  const notification = document.getElementById('scanning-notification');
  if (notification) {
    notification.classList.add('hiding');
    setTimeout(() => notification.remove(), 300);
  }
}

function showDeviceDiscoveryPopup(devices: any[]): void {
  const state = getDashboardState();
  const connectedAddresses = state.deviceStatus ? Object.keys(state.deviceStatus) : [];
  const newDevices = devices.filter(device => !connectedAddresses.includes(device.address));

  if (newDevices.length === 0) {
    showNoDevicesFoundNotification();
    return;
  }

  // Remove any existing discovery popup
  const existingPopup = document.getElementById('device-discovery-popup');
  if (existingPopup) existingPopup.remove();

  const popup = document.createElement('div');
  popup.id = 'device-discovery-popup';
  popup.className = 'device-discovery-popup';
  popup.innerHTML = `
    <div class="discovery-content">
      <div class="discovery-header">
        <h3>🎯 Found ${newDevices.length} Device${newDevices.length !== 1 ? 's' : ''}!</h3>
        <button class="close-btn" onclick="this.closest('.device-discovery-popup').remove();">×</button>
      </div>
      <div class="discovery-body">
        ${newDevices.slice(0, 3).map(device => `
          <div class="discovery-device">
            <div class="device-info">
              <strong>${device.name}</strong>
              <span class="device-address">${device.address}</span>
            </div>
            <button class="btn btn-sm btn-primary" onclick="window.handleConnectFromDiscovery('${device.address}')">
              Connect
            </button>
          </div>
        `).join('')}
        ${newDevices.length > 3 ? `
          <div class="more-devices">
            <span>and ${newDevices.length - 3} more...</span>
            <button class="btn btn-sm btn-outline" onclick="window.showAllDiscoveredDevices()">
              View All
            </button>
          </div>
        ` : ''}
      </div>
      <div class="discovery-footer">
        <button class="btn btn-sm btn-secondary" onclick="this.closest('.device-discovery-popup').remove();">
          Dismiss
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Add styles if not already present
  if (!document.getElementById('discovery-popup-styles')) {
    const styles = document.createElement('style');
    styles.id = 'discovery-popup-styles';
    styles.textContent = `
      .device-discovery-popup {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        z-index: 1001;
        max-width: 400px;
        animation: slideInUp 0.4s ease-out;
      }

      .discovery-content {
        padding: 0;
      }

      .discovery-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color);
        background: linear-gradient(135deg, #dbeafe, #bfdbfe);
        border-radius: 12px 12px 0 0;
      }

      .discovery-header h3 {
        margin: 0;
        color: #1d4ed8;
        font-size: 16px;
        font-weight: 600;
      }

      .close-btn {
        background: none;
        border: none;
        color: #3b82f6;
        font-size: 20px;
        font-weight: bold;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s ease;
      }

      .close-btn:hover {
        background: rgba(0, 0, 0, 0.1);
      }

      .discovery-body {
        padding: 16px 20px;
        max-height: 300px;
        overflow-y: auto;
      }

      .discovery-device {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid var(--border-color);
      }

      .discovery-device:last-child {
        border-bottom: none;
      }

      .device-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }

      .device-info strong {
        color: var(--text-primary);
        font-size: 14px;
      }

      .device-address {
        color: var(--text-secondary);
        font-size: 12px;
        font-family: monospace;
      }

      .more-devices {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        color: var(--text-secondary);
        font-size: 14px;
      }

      .discovery-footer {
        padding: 12px 20px;
        border-top: 1px solid var(--border-color);
        text-align: center;
      }

      @keyframes slideInUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    const popup = document.getElementById('device-discovery-popup');
    if (popup) popup.remove();
  }, 10000);
}

function showNoDevicesFoundNotification(): void {
  // Show a temporary notification that no new devices were found
  const notification = document.createElement('div');
  notification.className = 'temporary-notification';
  notification.innerHTML = `
    <div class="notification-content">
      <span>📡</span>
      <span>No new devices found</span>
    </div>
  `;

  // Add styles if not already present
  if (!document.getElementById('temp-notification-styles')) {
    const styles = document.createElement('style');
    styles.id = 'temp-notification-styles';
    styles.textContent = `
      .temporary-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out, slideOutRight 0.3s ease-in 2s forwards;
      }

      .notification-content {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-primary);
        font-size: 14px;
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(notification);

  // Auto-remove after animation
  setTimeout(() => notification.remove(), 2500);
}

function showScanErrorNotification(): void {
  // Show a temporary error notification
  const notification = document.createElement('div');
  notification.className = 'temporary-notification error';
  notification.innerHTML = `
    <div class="notification-content">
      <span>⚠️</span>
      <span>Scan failed - please try again</span>
    </div>
  `;

  // Add error styles if not already present
  if (!document.getElementById('error-notification-styles')) {
    const styles = document.createElement('style');
    styles.id = 'error-notification-styles';
    styles.textContent = `
      .temporary-notification.error {
        background: #fef2f2;
        border-color: #fca5a5;
        color: #dc2626;
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(notification);

  // Auto-remove after animation
  setTimeout(() => notification.remove(), 3000);
}

// Handler for connecting from discovery popup
async function handleConnectFromDiscovery(address: string): Promise<void> {
  try {
    // Update the discovery popup to show connecting state
    const deviceElement = document.querySelector(`.discovery-device button[onclick*="${address}"]`) as HTMLButtonElement;
    if (deviceElement) {
      deviceElement.textContent = 'Connecting...';
      deviceElement.disabled = true;
    }

    await handleConnectDevice(address);

    // Close the discovery popup on successful connection
    const popup = document.getElementById('device-discovery-popup');
    if (popup) popup.remove();

  } catch (error) {
    // Restore button state on error
    const deviceElement = document.querySelector(`.discovery-device button[onclick*="${address}"]`) as HTMLButtonElement;
    if (deviceElement) {
      deviceElement.textContent = 'Connect';
      deviceElement.disabled = false;
    }
    console.error('Failed to connect from discovery:', error);
  }
}

// Function to show all discovered devices in the full modal
function showAllDiscoveredDevices(): void {
  // Close the popup and show the full scan modal
  const popup = document.getElementById('device-discovery-popup');
  if (popup) popup.remove();

  showScanDevicesModal();
}

// Make functions available globally
declare global {
  interface Window {
    handleConnectFromDiscovery: (address: string) => Promise<void>;
    showAllDiscoveredDevices: () => void;
  }
}

window.handleConnectFromDiscovery = handleConnectFromDiscovery;
window.showAllDiscoveredDevices = showAllDiscoveredDevices;

export async function startModalScan(): Promise<void> {
  if (document.querySelector('.modal-overlay .scan-spinner')) return;

  try {
    setScanning(true);
    clearScanResults();
    // Refresh modal to show scanning state
    if ((window as any).refreshScanModal) {
      (window as any).refreshScanModal();
    }

    const results = await scanDevices();
    setScanResults(results);
  } catch (err) {
    clearScanResults();
    console.error('Failed to scan for devices:', err);
    // TODO: Add user notification for scan failure
  } finally {
    setScanning(false);
    // Refresh modal to show results
    if ((window as any).refreshScanModal) {
      (window as any).refreshScanModal();
    }
  }
}

export async function handleConnectDevice(address: string): Promise<void> {
  try {
    // Prevent concurrent connections to the same device
    if (isDeviceConnecting(address)) {
      console.log(`Device ${address} is already being connected, skipping`);
      return;
    }

    // Mark device as connecting
    addConnectingDevice(address);

    // Immediately refresh scan modal to show connecting state
    if ((window as any).refreshScanModal) {
      (window as any).refreshScanModal();
    }

    // Update UI to show connecting state using unique identifier
    const buttonId = `connect-btn-${address.replace(/:/g, '-')}`;
    const button = document.getElementById(buttonId) as HTMLButtonElement;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span>⏳</span> Connecting...';
    }

    // Trigger UI refresh to show connecting state across all components
    const { refreshDashboard } = await import("../render");
    refreshDashboard();

    // Perform the actual connection
    await connectDevice(address);

    // Load updated data
    await loadAllDashboardData();

    // Update button to show connected state
    if (button) {
      button.innerHTML = '<span>✅</span> Connected';
      button.disabled = true;
      button.classList.remove('btn-primary');
      button.classList.add('btn-success');
    }

    // Final dashboard refresh to show connected device
    refreshDashboard();

    // Also refresh the scan modal if it's open
    if ((window as any).refreshScanModal) {
      (window as any).refreshScanModal();
    }

  } catch (error) {
    console.error('Failed to connect to device:', error);

    // Show error state on button
    const buttonId = `connect-btn-${address.replace(/:/g, '-')}`;
    const button = document.getElementById(buttonId) as HTMLButtonElement;
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
  } finally {
    // Always remove from connecting state
    removeConnectingDevice(address);
  }
}

// Generic handler for configuring any device type
export async function handleConfigureDevice(address: string, deviceType: string): Promise<void> {
  if (deviceType === 'doser') {
    try {
      const apiDevice = await getDoserConfiguration(address);
      const modalDevice = apiToDoserDevice(apiDevice);
      showDoserServerConfigModal(modalDevice);
    } catch (err) {
      // If no config exists, create a new one for configuration
      console.log(`No existing doser configuration for ${address}, opening new server configuration interface`);
      const modalDevice = createDefaultDoserDevice(address);
      showDoserServerConfigModal(modalDevice);
    }
  } else if (deviceType === 'light') {
    try {
      const apiDevice = await getLightConfiguration(address);
      const modalDevice = apiToLightDevice(apiDevice);
      showLightConfigurationModal(modalDevice);
    } catch (err) {
      // If no config exists, create a new one for configuration
      console.log(`No existing light configuration for ${address}, opening new configuration interface`);
      const modalDevice = createDefaultLightDevice(address);
      showLightConfigurationModal(modalDevice);
    }
  }
}

// Handler for device settings (command/schedule interface)
export async function handleDeviceSettings(address: string, deviceType: string): Promise<void> {
  if (deviceType === 'doser') {
    try {
      const apiDevice = await getDoserConfiguration(address);
      const modalDevice = apiToDoserDevice(apiDevice);
      showDoserDeviceSettingsModal(modalDevice);
    } catch (err) {
      // If no config exists, create a new one for settings
      console.log(`No existing doser configuration for ${address}, opening new device settings interface`);
      const modalDevice = createDefaultDoserDevice(address);
      showDoserDeviceSettingsModal(modalDevice);
    }
  } else if (deviceType === 'light') {
    // For lights, use the device settings modal for commands
    try {
      const apiDevice = await getLightConfiguration(address);
      const modalDevice = apiToLightDevice(apiDevice);
      showLightDeviceSettingsModal(modalDevice);
    } catch (err) {
      // If no config exists, create a new one for settings
      console.log(`No existing light configuration for ${address}, opening new device settings interface`);
      const modalDevice = createDefaultLightDevice(address);
      showLightDeviceSettingsModal(modalDevice);
    }
  }
}

// Modal functions
function showScanDevicesModal(): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'scan-modal';

  const renderModalContent = () => {
    const state = getDashboardState();
    const connectedAddresses = state.deviceStatus ? Object.keys(state.deviceStatus) : [];
    const newDevices = state.scanResults.filter(device => !connectedAddresses.includes(device.address));

    if (state.isScanning) {
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

    if (state.scanResults.length > 0) {
      if (newDevices.length === 0) {
        return `
          <div class="modal-content" style="max-width: 90vw; width: 500px;">
            <div class="modal-header">
              <h2>No New Devices Found</h2>
              <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 40px;">
              <p>Found ${state.scanResults.length} device${state.scanResults.length !== 1 ? 's' : ''}, but they are already connected.</p>
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

/**
 * Render a single scan result card for the modal
 */
