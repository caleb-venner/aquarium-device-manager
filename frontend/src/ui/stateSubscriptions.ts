// State subscription system for automatic UI updates

import { deviceStore } from "../stores/deviceStore";
import { renderNotifications } from "./notifications";

let unsubscribeCallbacks: (() => void)[] = [];

export function setupStateSubscriptions(): void {
  // Subscribe to device changes
  const unsubscribeDevices = deviceStore.subscribe(
    (state) => state.devices,
    (devices, prevDevices) => {
      // Only update if the device data actually changed
      if (devices !== prevDevices) {
        console.log(`Device state changed: ${devices.size} devices`);
        updateDashboardView();
      }
    }
  );

  // Subscribe to UI state changes
  const unsubscribeUI = deviceStore.subscribe(
    (state) => state.ui,
    (ui, prevUI) => {
      // Update dashboard for loading/scanning state changes
      if (ui.isScanning !== prevUI?.isScanning ||
          ui.scanResults.length !== prevUI?.scanResults.length ||
          ui.globalError !== prevUI?.globalError) {
        updateDashboardView();
      }

      // Update notifications when they change
      if (ui.notifications.length !== prevUI?.notifications.length) {
        renderNotifications();
      }
    }
  );

  // Subscribe to command queue changes
  const unsubscribeQueue = deviceStore.subscribe(
    (state) => state.commandQueue,
    (queue, prevQueue) => {
      if (queue.length !== prevQueue?.length) {
        console.log(`Command queue changed: ${queue.length} commands`);
        // Update any UI elements that show command queue status
        updateCommandQueueIndicator(queue.length);
      }
    }
  );

  // Store cleanup functions
  unsubscribeCallbacks = [unsubscribeDevices, unsubscribeUI, unsubscribeQueue];
}

export function cleanupStateSubscriptions(): void {
  unsubscribeCallbacks.forEach(cleanup => cleanup());
  unsubscribeCallbacks = [];
}

function updateCommandQueueIndicator(queueLength: number): void {
  // Update any command queue indicators in the UI
  const indicators = document.querySelectorAll('.command-queue-indicator');
  indicators.forEach(indicator => {
    if (queueLength > 0) {
      indicator.textContent = `${queueLength}`;
      indicator.classList.add('active');
    } else {
      indicator.textContent = '';
      indicator.classList.remove('active');
    }
  });
}

// Update dashboard view safely without circular imports
function updateDashboardView(): void {
  // Look for the dashboard container and trigger a re-render
  const modernContainer = document.getElementById("modern-dashboard-content");
  if (modernContainer) {
    // Trigger a custom event that the modern dashboard can listen to
    document.dispatchEvent(new CustomEvent('dashboard-update-requested'));
  }

  // Also try to call any global update function if available
  if (typeof (window as any).updateModernDashboard === 'function') {
    (window as any).updateModernDashboard();
  }
}

// Throttled update functions to prevent excessive re-renders
let updateTimeout: number | null = null;

export function throttledDashboardUpdate(): void {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  updateTimeout = window.setTimeout(() => {
    updateDashboardView();
    updateTimeout = null;
  }, 100); // Throttle to max 10 updates per second
}
