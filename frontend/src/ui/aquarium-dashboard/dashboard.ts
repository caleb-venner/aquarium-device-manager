/**
 * Main dashboard module - entry point for the refactored dashboard
 */

import { renderProductionDashboard, refreshDashboard } from "./render";
import { loadAllDashboardData } from "./services/data-service";
import { setCurrentTab } from "./state";
import { renderWattageCalculator, calculateWattageFromInputs, setWattageTestCase } from "./components/wattage-calculator";
import { renderHeadCommandInterface } from "./modals/device-modals";
import "./modals/device-config-modal"; // Import the new unified device config modal

// Export the main render function
export { renderProductionDashboard, refreshDashboard };

// Export data loading
export { loadAllDashboardData };

// Export wattage calculator functions for global handlers
export { calculateWattageFromInputs, setWattageTestCase };

// Initialize global handlers
export function initializeDashboardHandlers(): void {
  // Tab switching
  (window as any).switchTab = async (tab: "overview" | "devices" | "dev") => {
    setCurrentTab(tab);
    refreshDashboard();
  };

  // Data refresh
  (window as any).handleRefreshAll = async () => {
    const { useActions } = await import("../../stores/deviceStore");
    const { refreshDeviceStatus } = await import("../../api/devices");
    const { getDashboardState, setRefreshing } = await import('./state');
    const { refreshDashboard } = await import('./render');

    try {
      setRefreshing(true);
      refreshDashboard(); // Show refreshing state

      const state = getDashboardState();
      const connectedDevices = state.deviceStatus ? Object.keys(state.deviceStatus) : [];

      if (connectedDevices.length === 0) {
        useActions().addNotification({
          type: 'info',
          message: 'No connected devices to refresh'
        });
        return;
      }

      // Trigger status refresh for all connected devices
      const refreshPromises = connectedDevices.map(address =>
        refreshDeviceStatus(address).catch(error => {
          console.error(`Failed to refresh device ${address}:`, error);
          return Promise.resolve(); // Don't fail the entire operation
        })
      );

      await Promise.all(refreshPromises);

      // Reload device status to get updated data
      await loadAllDashboardData();

      useActions().addNotification({
        type: 'success',
        message: `Successfully refreshed status for ${connectedDevices.length} connected device${connectedDevices.length !== 1 ? 's' : ''}`
      });
    } catch (error) {
      useActions().addNotification({
        type: 'error',
        message: `Failed to refresh device status: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setRefreshing(false);
      refreshDashboard(); // Remove refreshing state
    }
  };

  // Initialize wattage calculator when dev tab is loaded
  setTimeout(() => {
    if (document.getElementById('watt-red')) {
      calculateWattageFromInputs();
    }
  }, 100);

  // Scan handlers
  (window as any).handleScanDevices = async () => {
    const { handleScanDevices } = await import("./handlers/dashboard-handlers");
    await handleScanDevices();
  };

  (window as any).startModalScan = async () => {
    const { startModalScan } = await import("./handlers/dashboard-handlers");
    await startModalScan();
  };

  (window as any).handleConnectDevice = async (address: string) => {
    const { handleConnectDevice } = await import("./handlers/dashboard-handlers");
    await handleConnectDevice(address);
  };

  (window as any).clearScanResults = async () => {
    const { clearScanResults } = await import("./state");
    clearScanResults();
    refreshDashboard();
  };

  // Device configuration handlers
  (window as any).handleConfigureDevice = async (address: string, deviceType: string) => {
    const { handleConfigureDevice } = await import("./handlers/dashboard-handlers");
    await handleConfigureDevice(address, deviceType);
  };

  (window as any).handleDeviceSettings = async (address: string, deviceType: string) => {
    const { handleDeviceSettings } = await import("./handlers/dashboard-handlers");
    await handleDeviceSettings(address, deviceType);
  };

  // Device management handlers
  (window as any).handleDeleteDevice = async (address: string, deviceType: string) => {
    console.log('Delete device:', address, deviceType);
    // TODO: Implement device deletion via API
  };

  (window as any).handleRefreshDevice = async (address: string) => {
    console.log('Refresh device:', address);
    // TODO: Implement device refresh via API
  };

  (window as any).handleClearAutoSettings = async (deviceId: string) => {
    console.log('Clear auto settings:', deviceId);
    // TODO: Implement clear auto settings via API
  };

  // Light control handlers
  (window as any).switchLightSettingsTab = (event: Event, tabName: string) => {
    // Handle tab switching in light settings modal
    const modal = (event.target as HTMLElement).closest('.modal-overlay');
    if (modal) {
      const tabButtons = modal.querySelectorAll('.tab-button');
      const tabContents = modal.querySelectorAll('.tab-content');

      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      (event.target as HTMLElement).classList.add('active');
      const targetTab = modal.querySelector(`#${tabName}-tab`);
      if (targetTab) {
        targetTab.classList.add('active');
      }
    }
  };

  (window as any).handleTurnLightOn = async (deviceId: string) => {
    try {
      const { turnLightOn } = await import('../../api/commands');
      const { useActions } = await import("../../stores/deviceStore");

      console.log('Turning light on:', deviceId);
      await turnLightOn(deviceId);

      useActions().addNotification({
        type: 'success',
        message: `Light ${deviceId} turned on successfully`
      });
    } catch (error) {
      const { useActions } = await import("../../stores/deviceStore");
      useActions().addNotification({
        type: 'error',
        message: `Failed to turn on light ${deviceId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  (window as any).handleTurnLightOff = async (deviceId: string) => {
    try {
      const { turnLightOff } = await import('../../api/commands');
      const { useActions } = await import("../../stores/deviceStore");

      console.log('Turning light off:', deviceId);
      await turnLightOff(deviceId);

      useActions().addNotification({
        type: 'success',
        message: `Light ${deviceId} turned off successfully`
      });
    } catch (error) {
      const { useActions } = await import("../../stores/deviceStore");
      useActions().addNotification({
        type: 'error',
        message: `Failed to turn off light ${deviceId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  (window as any).handleSetManualMode = async (deviceId: string) => {
    try {
      console.log('handleSetManualMode called with deviceId:', deviceId);
      const { setManualMode } = await import('../../api/commands');
      const { useActions } = await import("../../stores/deviceStore");
      const { markDeviceStable } = await import('./state');

      console.log('Setting manual mode:', deviceId);
      await setManualMode(deviceId);

      // Mark device as stable on successful command
      markDeviceStable(deviceId);

      useActions().addNotification({
        type: 'success',
        message: `Light ${deviceId} switched to manual mode`
      });
    } catch (error) {
      console.error('Error in handleSetManualMode:', error);
      const { useActions } = await import("../../stores/deviceStore");
      const { markDeviceUnstable } = await import('./state');

      // Mark device as unstable on command failure
      markDeviceUnstable(deviceId);

      useActions().addNotification({
        type: 'error',
        message: `Failed to set manual mode for ${deviceId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  (window as any).handleEnableAutoMode = async (deviceId: string) => {
    try {
      console.log('handleEnableAutoMode called with deviceId:', deviceId);
      const { enableAutoMode } = await import('../../api/commands');
      const { useActions } = await import("../../stores/deviceStore");
      const { markDeviceStable } = await import('./state');

      console.log('Enabling auto mode:', deviceId);
      await enableAutoMode(deviceId);

      // Mark device as stable on successful command
      markDeviceStable(deviceId);

      useActions().addNotification({
        type: 'success',
        message: `Light ${deviceId} switched to auto mode`
      });
    } catch (error) {
      console.error('Error in handleEnableAutoMode:', error);
      const { useActions } = await import("../../stores/deviceStore");
      const { markDeviceUnstable } = await import('./state');

      // Mark device as unstable on command failure
      markDeviceUnstable(deviceId);

      useActions().addNotification({
        type: 'error',
        message: `Failed to enable auto mode for ${deviceId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  (window as any).handleManualBrightness = async (event: Event, deviceId: string) => {
    event.preventDefault();

    try {
      const { sendManualBrightnessCommands } = await import('../../api/commands');
      const { useActions } = await import("../../stores/deviceStore");

      const form = event.target as HTMLFormElement;
      const formData = new FormData(form);

      // Collect brightness values for each channel
      const payloads: Array<{ index: number; value: number }> = [];

      // Get all brightness inputs (they're named like channel-R, channel-G, etc.)
      const inputs = form.querySelectorAll('input[name^="channel-"]');
      inputs.forEach((element, index) => {
        const input = element as HTMLInputElement;
        const value = parseInt(input.value) || 0;
        payloads.push({ index, value });
      });

      if (payloads.length === 0) {
        throw new Error('No brightness values found');
      }

      console.log('Setting manual brightness:', deviceId, payloads);
      await sendManualBrightnessCommands(deviceId, payloads);

      useActions().addNotification({
        type: 'success',
        message: `Brightness set for light ${deviceId}`
      });
    } catch (error) {
      const { useActions } = await import("../../stores/deviceStore");
      useActions().addNotification({
        type: 'error',
        message: `Failed to set brightness for ${deviceId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  (window as any).handleAddAutoProgram = async (event: Event, deviceId: string) => {
    event.preventDefault();

    try {
      const { addAutoSetting } = await import('../../api/commands');
      const { useActions } = await import("../../stores/deviceStore");

      const form = event.target as HTMLFormElement;
      const formData = new FormData(form);

      // Extract form values
      const sunrise = formData.get('sunrise-time') as string;
      const sunset = formData.get('sunset-time') as string;
      const rampMinutes = parseInt(formData.get('ramp-minutes') as string) || 30;

      // Collect channel brightness values
      const channels: Record<string, number> = {};
      const channelInputs = form.querySelectorAll('input[name^="channel-"]');
      channelInputs.forEach((element) => {
        const input = element as HTMLInputElement;
        const channelKey = input.name.replace('channel-', '');
        const value = parseInt(input.value) || 0;
        channels[channelKey] = value;
      });

      if (!sunrise || !sunset) {
        throw new Error('Sunrise and sunset times are required');
      }

      const args = {
        sunrise,
        sunset,
        channels,
        ramp_up_minutes: rampMinutes,
      };

      console.log('Adding auto program:', deviceId, args);
      await addAutoSetting(deviceId, args);

      useActions().addNotification({
        type: 'success',
        message: `Auto program added for light ${deviceId}`
      });

      // Clear the form
      form.reset();
    } catch (error) {
      const { useActions } = await import("../../stores/deviceStore");
      useActions().addNotification({
        type: 'error',
        message: `Failed to add auto program for ${deviceId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  (window as any).selectLightMode = async (modeIndex: number) => {
    console.log('selectLightMode called with modeIndex:', modeIndex);

    // Get device information from modal context
    const commandInterface = document.getElementById('light-command-interface');
    if (!commandInterface) {
      console.error('light-command-interface not found');
      return;
    }

    const modal = commandInterface.closest('.modal-overlay');
    if (!modal) {
      console.error('modal-overlay not found');
      return;
    }

    // Get device ID from the data attribute instead of parsing header text
    const modalContent = modal.querySelector('.modal-content');
    const deviceId = modalContent?.getAttribute('data-device-id');

    console.log('Extracted device ID from modal:', deviceId);

    if (!deviceId) {
      console.error('Device ID not found in modal data attribute');
      return;
    }

    // First, trigger the appropriate mode change command
    if (modeIndex === 1) {
      // Manual Mode selected - trigger manual mode command
      console.log('Switching to manual mode:', deviceId);
      (window as any).handleSetManualMode(deviceId);
    } else if (modeIndex === 2) {
      // Auto Mode selected - trigger auto mode command
      console.log('Switching to auto mode:', deviceId);
      (window as any).handleEnableAutoMode(deviceId);
    }

    // Then update the command interface with the selected mode's configuration
    // Get device data and render mode command interface
    const { getDashboardState } = await import('./state');
    const state = getDashboardState();
    const device = state.lightConfigs.find((d: any) => d.name === deviceId || d.id === deviceId);

    if (device) {
      const { renderLightModeInterface } = await import('./modals/device-modals');
      commandInterface.innerHTML = renderLightModeInterface(modeIndex, device as any);
    } else {
      // Create a default device if no device data available
      const defaultDevice = {
        id: deviceId,
        name: deviceId,
        timezone: 'UTC',
        channels: [
          { key: 'R', label: 'Red', min: 0, max: 100, step: 1 },
          { key: 'G', label: 'Green', min: 0, max: 100, step: 1 },
          { key: 'B', label: 'Blue', min: 0, max: 100, step: 1 },
          { key: 'W', label: 'White', min: 0, max: 100, step: 1 }
        ],
        profile: { mode: 'manual' as const, levels: { R: 0, G: 0, B: 0, W: 0 } }
      };

      const { renderLightModeInterface } = await import('./modals/device-modals');
      commandInterface.innerHTML = renderLightModeInterface(modeIndex, defaultDevice as any);
    }

    // Update mode selector visual state (reuse head selector logic)
    const modeSelectors = modal.querySelectorAll('.head-selector');
    modeSelectors.forEach(selector => {
      selector.classList.remove('selected');
    });
    const selectedMode = modal.querySelector(`[data-head-index="${modeIndex}"]`);
    if (selectedMode) {
      selectedMode.classList.add('selected');
    }
  };

  // Doser control handlers
  (window as any).selectHead = async (headIndex: number) => {
    // Update the command interface with the selected head's configuration
    const commandInterface = document.getElementById('command-interface');
    if (commandInterface) {
      // Get the current device from the modal context
      const modal = commandInterface.closest('.modal-overlay');
      if (modal) {
        // Get device ID from the data attribute instead of parsing header text
        const modalContent = modal.querySelector('.modal-content');
        const deviceId = modalContent?.getAttribute('data-device-id');

        if (deviceId) {
          // Get device data and render head command interface
          const { getDashboardState } = await import('./state');
          const state = getDashboardState();
          const device = state.doserConfigs.find((d: any) => d.name === deviceId || d.id === deviceId);

          // Create head data (either from device or default)
          let head: any;
          if (device && device.configurations && Array.isArray(device.configurations)) {
            // Try to find existing head configuration data
            const config = device.configurations.find((c: any) => c.head_index === headIndex);
            head = config ? {
              index: headIndex as 1|2|3|4,
              label: `Head ${headIndex}`,
              active: config.active || false,
              schedule: config.schedule || { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
              recurrence: config.recurrence || { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const },
              missedDoseCompensation: config.missedDoseCompensation || false,
              calibration: config.calibration || { mlPerSecond: 1.0, lastCalibratedAt: '2024-01-01' }
            } : null;
          }

          // Create default head if no existing data
          if (!head) {
            head = {
              index: headIndex as 1|2|3|4,
              label: `Head ${headIndex}`,
              active: false,
              schedule: { mode: 'single' as const, dailyDoseMl: 10.0, startTime: '09:00' },
              recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const },
              missedDoseCompensation: false,
              calibration: { mlPerSecond: 1.0, lastCalibratedAt: '2024-01-01' }
            };
          }

          const { renderHeadCommandInterface } = await import('./modals/device-modals');
          commandInterface.innerHTML = renderHeadCommandInterface(headIndex, head);

          // Update head selector visual state
          const headSelectors = modal.querySelectorAll('.head-selector');
          headSelectors.forEach(selector => {
            selector.classList.remove('selected');
          });
          const selectedHead = modal.querySelector(`[data-head-index="${headIndex}"]`);
          if (selectedHead) {
            selectedHead.classList.add('selected');
          }
        }
      }
    }
  };
}

// Auto-load data on module import
loadAllDashboardData();
