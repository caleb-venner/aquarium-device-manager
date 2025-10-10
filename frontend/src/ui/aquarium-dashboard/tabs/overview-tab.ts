/**
 * Overview tab rendering
 */

import { getDashboardState } from "../state";
import { renderDeviceSection } from "../devices/device-card";
import { renderScanSection } from "../components/scan-results";

/**
 * Render the overview tab - shows device connection status
 */
export function renderOverviewTab(): string {
  const state = getDashboardState();

  if (!state.deviceStatus) {
    return `
      <div class="empty-state">
        <h2>No Device Status Available</h2>
        <p>Unable to retrieve device status. Please check your connection and try refreshing.</p>
        <button class="btn btn-primary" onclick="window.handleRefreshAll()">
          Refresh Status
        </button>
      </div>
    `;
  }

  // Convert StatusResponse object to array
  const devices = Object.entries(state.deviceStatus).map(([address, status]) => ({
    ...status,
    address
  }));

  // Show empty state if no devices, but don't show scan results here
  if (devices.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🔌</div>
        <h2>No Devices Connected</h2>
        <p>Get started by connecting your aquarium devices using the scan and connect options in the top navigation bar.</p>
        <div class="empty-state-actions">
          <p class="text-muted">
            <span class="icon">💡</span> Look for the "Scan" button in the top bar to discover nearby devices
          </p>
        </div>
      </div>
      ${renderScanSection(true)}
    `;
  }

  return `
    ${renderDeviceSection("Connected Devices", devices)}
  `;
}
