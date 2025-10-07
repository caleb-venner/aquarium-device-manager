// Enhanced Device Card Component for Modern Dashboard

import { useActions } from "../stores/deviceStore";
import type { DeviceState, DoserParsed, LightParsed } from "../types/models";

export function renderDeviceCard(device: DeviceState): string {
  const { status, isLoading, error, lastUpdated } = device;
  const { connected, device_type, model_name } = status;

  return `
    <div class="device-card ${device_type} ${connected ? 'connected' : 'disconnected'} ${isLoading ? 'loading' : ''}">
      ${renderCardHeader(device)}
      ${renderCardStatus(device)}
      ${renderCardControls(device)}
      ${error ? renderCardError(error) : ''}
    </div>
  `;
}

function renderCardHeader(device: DeviceState): string {
  const { status, lastUpdated } = device;
  const { address, model_name, device_type } = status;

  const timeAgo = getTimeAgo(lastUpdated);
  const deviceIcon = device_type === "light" ? "💡" : "💊";

  return `
    <div class="card-header">
      <div class="device-info">
        <div class="device-title">
          <span class="device-icon">${deviceIcon}</span>
          <h3>${model_name || address}</h3>
        </div>
        <p class="device-address">${address}</p>
      </div>
      <div class="device-status">
        ${renderConnectionBadge(status.connected)}
        <span class="last-updated" title="Last updated: ${new Date(lastUpdated).toLocaleString()}">
          ${timeAgo}
        </span>
      </div>
    </div>
  `;
}

function renderConnectionBadge(connected: boolean): string {
  return `
    <span class="connection-badge ${connected ? 'connected' : 'disconnected'}">
      <span class="badge-dot"></span>
      ${connected ? 'Connected' : 'Disconnected'}
    </span>
  `;
}

function renderCardStatus(device: DeviceState): string {
  const { status } = device;

  if (!status.parsed) {
    return `
      <div class="card-status">
        <p class="no-data">No status data available</p>
      </div>
    `;
  }

  if (status.device_type === "light") {
    return renderLightStatus(status.parsed as LightParsed);
  } else if (status.device_type === "doser") {
    return renderDoserStatus(status.parsed as DoserParsed);
  }

  return '';
}

function renderLightStatus(parsed: LightParsed): string {
  const { current_hour, current_minute, weekday, keyframes } = parsed;

  // Find current brightness levels
  const currentKeyframes = keyframes.filter(kf => kf.value !== null);
  const maxBrightness = Math.max(...currentKeyframes.map(kf => kf.percent || 0));

  const currentTime = current_hour !== null && current_minute !== null
    ? `${String(current_hour).padStart(2, '0')}:${String(current_minute).padStart(2, '0')}`
    : 'Unknown';

  const weekdayName = weekday !== null ? getWeekdayName(weekday) : 'Unknown';

  return `
    <div class="card-status light-status">
      <div class="status-grid">
        <div class="status-item">
          <span class="label">Current Time</span>
          <span class="value">${currentTime}</span>
        </div>
        <div class="status-item">
          <span class="label">Day</span>
          <span class="value">${weekdayName}</span>
        </div>
        <div class="status-item">
          <span class="label">Max Brightness</span>
          <span class="value">${maxBrightness}%</span>
        </div>
        <div class="status-item">
          <span class="label">Channels</span>
          <span class="value">${keyframes.length}</span>
        </div>
      </div>
      ${renderBrightnessChart(keyframes)}
    </div>
  `;
}

function renderDoserStatus(parsed: DoserParsed): string {
  const { hour, minute, weekday, heads } = parsed;

  const currentTime = hour !== null && minute !== null
    ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    : 'Unknown';

  const weekdayName = weekday !== null ? getWeekdayName(weekday) : 'Unknown';
  const activeHeads = heads.filter(head => head.mode > 0).length;

  return `
    <div class="card-status doser-status">
      <div class="status-grid">
        <div class="status-item">
          <span class="label">Current Time</span>
          <span class="value">${currentTime}</span>
        </div>
        <div class="status-item">
          <span class="label">Day</span>
          <span class="value">${weekdayName}</span>
        </div>
        <div class="status-item">
          <span class="label">Active Heads</span>
          <span class="value">${activeHeads}/${heads.length}</span>
        </div>
      </div>
      ${renderDoserHeads(heads)}
    </div>
  `;
}

function renderBrightnessChart(keyframes: Array<{index: number, percent: number}>): string {
  if (keyframes.length === 0) return '';

  const maxPercent = Math.max(...keyframes.map(kf => kf.percent));

  return `
    <div class="brightness-chart">
      <div class="chart-title">Channel Levels</div>
      <div class="chart-bars">
        ${keyframes.map(kf => `
          <div class="chart-bar">
            <div class="bar-fill" style="height: ${(kf.percent / Math.max(maxPercent, 1)) * 100}%"></div>
            <div class="bar-label">Ch${kf.index + 1}</div>
            <div class="bar-value">${kf.percent}%</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDoserHeads(heads: Array<{mode: number, hour: number, minute: number, dosed_tenths_ml: number, mode_label: string}>): string {
  return `
    <div class="doser-heads">
      <div class="heads-title">Pump Heads</div>
      <div class="heads-grid">
        ${heads.map((head, index) => `
          <div class="head-item ${head.mode > 0 ? 'active' : 'inactive'}">
            <div class="head-number">${index + 1}</div>
            <div class="head-info">
              <div class="head-mode">${head.mode_label}</div>
              ${head.mode > 0 ? `
                <div class="head-schedule">${String(head.hour).padStart(2, '0')}:${String(head.minute).padStart(2, '0')}</div>
                <div class="head-volume">${(head.dosed_tenths_ml / 10).toFixed(1)}ml</div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderCardControls(device: DeviceState): string {
  const { status, isLoading } = device;
  const { address, connected, device_type } = status;

  return `
    <div class="card-controls">
      <div class="control-group basic-controls">
        <button
          class="btn btn-sm ${isLoading ? 'loading' : ''}"
          onclick="handleRefreshDevice('${address}')"
          ${isLoading ? 'disabled' : ''}
        >
          ${isLoading ? '↻' : '🔄'} Refresh
        </button>

        <button
          class="btn btn-sm ${connected ? 'btn-warning' : 'btn-primary'}"
          onclick="${connected ? `handleDisconnectDevice('${address}')` : `handleConnectDevice('${address}')`}"
        >
          ${connected ? '🔌 Disconnect' : '🔗 Connect'}
        </button>
      </div>

      ${connected ? renderDeviceSpecificControls(device) : ''}
    </div>
  `;
}

function renderDeviceSpecificControls(device: DeviceState): string {
  const { status } = device;
  const { address, device_type } = status;

  if (device_type === "light") {
    return `
      <div class="control-group device-controls">
        <button class="btn btn-sm btn-success" onclick="handleLightOn('${address}')">
          💡 On
        </button>
        <button class="btn btn-sm btn-secondary" onclick="handleLightOff('${address}')">
          🌙 Off
        </button>
        <button class="btn btn-sm" onclick="handleLightAuto('${address}')">
          🤖 Auto
        </button>
      </div>
    `;
  } else if (device_type === "doser") {
    return `
      <div class="control-group device-controls">
        <button class="btn btn-sm" onclick="handleDoserSchedule('${address}')">
          ⏰ Schedule
        </button>
        <button class="btn btn-sm" onclick="handleDoserTest('${address}')">
          🧪 Test Dose
        </button>
      </div>
    `;
  }

  return '';
}

function renderCardError(error: string): string {
  return `
    <div class="card-error">
      <span class="error-icon">⚠️</span>
      <span class="error-message">${error}</span>
    </div>
  `;
}

// Utility functions
function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return "Just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return new Date(timestamp).toLocaleDateString();
}

function getWeekdayName(weekday: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[weekday] || 'Unknown';
}

// Event handlers for device controls
export function setupDeviceCardHandlers(): void {
  const { refreshDevice, connectToDevice, queueCommand, addNotification } = useActions();

  // Refresh device
  (window as any).handleRefreshDevice = async (address: string) => {
    try {
      await refreshDevice(address);
      addNotification({
        type: "success",
        message: `Device ${address} refreshed`,
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

  // Connect device
  (window as any).handleConnectDevice = async (address: string) => {
    try {
      await connectToDevice(address);
    } catch (error) {
      console.error(`Connection failed for ${address}:`, error);
    }
  };

  // Disconnect device
  (window as any).handleDisconnectDevice = async (address: string) => {
    try {
      // TODO: Implement disconnect functionality
      addNotification({
        type: "info",
        message: "Disconnect functionality coming soon",
        autoHide: true
      });
    } catch (error) {
      console.error(`Disconnect failed for ${address}:`, error);
    }
  };

  // Light controls
  (window as any).handleLightOn = async (address: string) => {
    try {
      await queueCommand(address, { action: "turn_on" });
    } catch (error) {
      console.error(`Turn on failed for ${address}:`, error);
    }
  };

  (window as any).handleLightOff = async (address: string) => {
    try {
      await queueCommand(address, { action: "turn_off" });
    } catch (error) {
      console.error(`Turn off failed for ${address}:`, error);
    }
  };

  (window as any).handleLightAuto = async (address: string) => {
    try {
      await queueCommand(address, { action: "enable_auto_mode" });
    } catch (error) {
      console.error(`Auto mode failed for ${address}:`, error);
    }
  };

  // Doser controls
  (window as any).handleDoserSchedule = async (address: string) => {
    addNotification({
      type: "info",
      message: "Schedule configuration coming soon",
      autoHide: true
    });
  };

  (window as any).handleDoserTest = async (address: string) => {
    addNotification({
      type: "info",
      message: "Test dose functionality coming soon",
      autoHide: true
    });
  };
}
