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

  // Convert StatusResponse object to array
  const devices = Object.entries(state.deviceStatus || {}).map(([address, status]) => ({
    ...status,
    address
  }));

  // Show empty state if no devices
  if (devices.length === 0) {
    return `
      <div class="empty-state">
        <h2>No Devices Connected</h2>
        <p>Get started by connecting your aquarium devices using the scan and connect options in the top navigation bar.</p>
        <div class="empty-state-actions">
          <p class="text-muted">
            Look for the "Scan" button in the top bar to discover nearby devices
          </p>
        </div>
      </div>
    `;
  }

  return `
    ${renderDeviceSection("Connected Devices", devices)}
  `;
}
