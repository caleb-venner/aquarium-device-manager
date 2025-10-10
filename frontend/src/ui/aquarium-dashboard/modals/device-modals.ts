/**
 * Modal components for device configuration
 */

import type { DoserDevice, LightDevice } from "../../../types/models";
import { getDashboardState } from "../state";
import { renderModalConnectionStatus, getConnectionHealth, getConnectionMessage } from "../utils/connection-utils";

/**
 * Show the doser server configuration modal - for device and head names only
 */
export function showDoserServerConfigModal(device: DoserDevice): void {
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
export function showDoserDeviceSettingsModal(device: DoserDevice): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';

  // Get current device status for connection info
  const state = getDashboardState();
  const deviceStatus = state.deviceStatus?.[device.id] || null;
  const connectionStatus = renderModalConnectionStatus(deviceStatus, device.id);
  const connectionHealth = getConnectionHealth(deviceStatus, device.id);
  const connectionMessage = getConnectionMessage(connectionHealth, device.id);

  modal.innerHTML = `
    <div class="modal-content doser-config-modal" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;" data-device-id="${device.id}">
      <div class="modal-header" style="position: relative; display: flex; align-items: center; justify-content: space-between;">
        <h2>Doser Settings: ${device.name || device.id}</h2>
        <div style="display: flex; align-items: center; gap: 12px;">
          ${connectionStatus}
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
        </div>
      </div>
      <div class="modal-body">
        ${connectionMessage ? `
          <div class="connection-warning">
            <div class="connection-warning-icon">⚠️</div>
            <div class="connection-warning-text">${connectionMessage}</div>
          </div>
        ` : ''}
        ${renderDoserDeviceSettingsInterface(device)}
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
 * Show the light configuration modal
 */
export function showLightConfigurationModal(device: LightDevice): void {
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
export function showLightDeviceSettingsModal(device: LightDevice): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';

  // Get current device status for connection info
  const state = getDashboardState();
  const deviceStatus = state.deviceStatus?.[device.id] || null;
  const connectionStatus = renderModalConnectionStatus(deviceStatus, device.id);
  const connectionHealth = getConnectionHealth(deviceStatus, device.id);
  const connectionMessage = getConnectionMessage(connectionHealth, device.id);

  modal.innerHTML = `
    <div class="modal-content light-settings-modal" style="max-width: 900px; max-height: 90vh; overflow-y: auto;" data-device-id="${device.id}">
      <div class="modal-header" style="position: relative; display: flex; align-items: center; justify-content: space-between;">
        <h2>Light Settings: ${device.name || device.id}</h2>
        <div style="display: flex; align-items: center; gap: 12px;">
          ${connectionStatus}
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
        </div>
      </div>
      <div class="modal-body">
        ${connectionMessage ? `
          <div class="connection-warning">
            <div class="connection-warning-icon">⚠️</div>
            <div class="connection-warning-text">${connectionMessage}</div>
          </div>
        ` : ''}
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
 * Render the doser server configuration interface
 */
function renderDoserServerConfigInterface(device: DoserDevice): string {
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
                     value=""
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
 * Render the doser device settings interface
 */
function renderDoserDeviceSettingsInterface(device: DoserDevice): string {
  return `
    <div class="doser-config-interface">
      <!-- Head Selector Section -->
      <div class="config-section">
        <h3>Dosing Heads</h3>
        <p class="section-description">Select a head to configure its schedule and settings. Click "Send Command" to apply changes to the device.</p>

        <div class="heads-grid">
          ${renderHeadSelector(device)}
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
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove();">
          Close
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the 4-head visual selector
 */
function renderHeadSelector(device: DoserDevice): string {
  // Ensure we have all 4 heads
  const allHeads = [];
  for (let i = 1; i <= 4; i++) {
    const existingHead = device.heads?.find((h) => h.index === i);
    const headName = `Head ${i}`;

    allHeads.push(existingHead || {
      index: i as 1|2|3|4,
      label: headName,
      active: false,
      schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
      recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
      missedDoseCompensation: false,
      calibration: { mlPerSecond: 1.0, lastCalibratedAt: new Date().toISOString() }
    });
  }

  return allHeads.map(head => {
    const headDisplayName = head.label || `Head ${head.index}`;

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
              `${head.schedule.dailyDoseMl || 0}ml ${head.schedule.mode === 'single' ? `at ${head.schedule.startTime || '00:00'}` : 'scheduled'}` :
              'Disabled'
            }
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render the light configuration form
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

      <!-- Placeholder for channel configuration -->
      <div class="form-section">
        <h3>Channel Configuration</h3>
        <div class="placeholder-content" style="padding: 40px; text-align: center; color: var(--gray-500);">
          <div style="font-size: 48px; margin-bottom: 20px;">💡</div>
          <p>Light channel configuration - Coming Soon</p>
          <p>This section will contain channel setup, intensity controls, and scheduling.</p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove();">
          Cancel
        </button>
        <button class="btn btn-primary" onclick="window.saveLightConfiguration('${device.id}')">
          Save Configuration
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the light device settings interface
 */
function renderLightDeviceSettingsInterface(device: LightDevice): string {
  return `
    <div class="light-config-interface">
      <!-- Basic Controls (no heading) -->
      <div class="basic-controls-grid">
        <button class="btn btn-success" onclick="window.handleTurnLightOn('${device.id}')">
          <span>💡</span> Turn On
        </button>
        <button class="btn btn-danger" onclick="window.handleTurnLightOff('${device.id}')">
          <span>🌙</span> Turn Off
        </button>
      </div>

      <!-- Mode Selector Section (using doser head pattern) -->
      <div class="config-section">
        <h3>Control Modes</h3>
        <p class="section-description">Select a mode to switch the device and configure its settings.</p>

        <div class="heads-grid">
          ${renderLightModeSelector(device)}
        </div>
      </div>

      <!-- Command Interface Section (using doser pattern) -->
      <div class="config-section">
        <div id="light-command-interface">
          <div class="no-head-selected">
            <div class="empty-state-icon">⚙️</div>
            <h4>No Mode Selected</h4>
            <p>Select a control mode above to configure its settings.</p>
          </div>
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
 * Render the light mode selector (based on doser head selector but with Manual/Auto modes)
 */
function renderLightModeSelector(device: LightDevice): string {
  const modes = [
    {
      index: 1,
      label: 'Manual Control',
      icon: '🎛️',
      description: 'Switch to manual & set brightness',
      active: device.profile?.mode === 'manual'
    },
    {
      index: 2,
      label: 'Auto Mode',
      icon: '🕐',
      description: 'Switch to auto & configure schedule',
      active: device.profile?.mode === 'auto'
    }
  ];

  return modes.map(mode => {
    return `
      <div class="head-selector ${mode.active ? 'active' : 'inactive'}"
           onclick="window.selectLightMode(${mode.index})"
           data-head-index="${mode.index}">
        <div class="head-icon">
          <div class="head-number">${mode.icon}</div>
          <div class="head-status ${mode.active ? 'active' : 'inactive'}"></div>
        </div>
        <div class="head-info">
          <div class="head-label">${mode.label}</div>
          <div class="head-summary">
            ${mode.description}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render light mode interface content (based on doser head command interface)
 */
export function renderLightModeInterface(modeIndex: number, device: LightDevice): string {
  if (modeIndex === 1) {
    // Manual Control
    return `
      <h3>Manual Brightness Control</h3>
      <p class="section-description">Set individual channel brightness levels manually.</p>

      <form id="manual-brightness-form" onsubmit="window.handleManualBrightness(event, '${device.id}')">
        <div class="brightness-controls">
          ${renderChannelBrightnessInputs(device)}
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Set Brightness</button>
        </div>
      </form>
    `;
  } else if (modeIndex === 2) {
    // Auto Mode
    return `
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
            <input type="time" id="sunrise-time" name="sunrise-time" value="08:00" class="form-input">
          </div>
          <div class="form-group">
            <label for="sunset-time">Sunset Time:</label>
            <input type="time" id="sunset-time" name="sunset-time" value="20:00" class="form-input">
          </div>
          <div class="form-group">
            <label for="ramp-minutes">Ramp Time (minutes):</label>
            <input type="number" id="ramp-minutes" name="ramp-minutes" value="30" min="0" max="150" class="form-input">
          </div>
        </div>

        <div class="form-group">
          <label>Peak Brightness (%):</label>
          <div class="brightness-inputs">
            ${renderChannelBrightnessInputs(device)}
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
          <button type="submit" class="btn btn-primary">Add Program</button>
        </div>
      </form>
    `;
  }

  return '<p>Select a mode to configure its settings.</p>';
}

/**
 * Render channel brightness inputs for manual control
 */
function renderChannelBrightnessInputs(device: LightDevice): string {
  // If no channels defined, provide default RGBW channels
  const channels = device.channels && device.channels.length > 0 ? device.channels : [
    { key: 'R', label: 'Red', min: 0, max: 100, step: 1 },
    { key: 'G', label: 'Green', min: 0, max: 100, step: 1 },
    { key: 'B', label: 'Blue', min: 0, max: 100, step: 1 },
    { key: 'W', label: 'White', min: 0, max: 100, step: 1 }
  ];

  return channels.map((channel, index) => `
    <div class="channel-input">
      <label for="channel-${channel.key}">${channel.label || channel.key}:</label>
      <input type="number" id="channel-${channel.key}"
             name="channel-${channel.key}"
             min="${channel.min || 0}"
             max="${channel.max || 100}"
             step="${channel.step || 1}"
             value="0"
             class="form-input">
      <span class="unit">%</span>
    </div>
  `).join('');
}

/**
 * Render the command interface for a selected head
 */
function renderHeadCommandInterface(headIndex: number, head: any): string {
  const schedule = head.schedule || { mode: 'single', dailyDoseMl: 10.0, startTime: '09:00' };
  const recurrence = head.recurrence || { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };

  return `
    <div class="head-command-interface">
      <div class="command-header">
        <h4>Configure Head ${headIndex}</h4>
        <div class="head-status-indicator ${head.active ? 'active' : 'inactive'}">
          ${head.active ? '🟢 Active' : '🔴 Inactive'}
        </div>
      </div>

      <!-- Schedule Configuration -->
      <div class="form-section">
        <h5>Schedule Configuration</h5>

        <div class="form-group">
          <label for="schedule-mode-${headIndex}">Mode:</label>
          <select id="schedule-mode-${headIndex}" class="form-select" onchange="window.updateScheduleModeUI(${headIndex}, this.value)">
            <option value="disabled" ${!head.active ? 'selected' : ''}>Disabled</option>
            <option value="single" ${schedule.mode === 'single' ? 'selected' : ''}>Daily - Single dose at set time</option>
            <option value="every_hour" ${schedule.mode === 'every_hour' ? 'selected' : ''}>24 Hour - Hourly dosing</option>
            <option value="custom_periods" ${schedule.mode === 'custom_periods' ? 'selected' : ''}>Custom - Custom time periods</option>
            <option value="timer" ${schedule.mode === 'timer' ? 'selected' : ''}>Timer - Multiple specific times</option>
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
          </div>
        </div>
      `;

    default:
      return '<div class="schedule-disabled"><p>Head is disabled. Select a mode to configure.</p></div>';
  }
}

export { renderHeadCommandInterface };
