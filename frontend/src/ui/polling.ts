// Background polling system for device status updates

import { useActions, useDevices } from "../stores/deviceStore";

const POLLING_INTERVALS = {
  FAST: 5000,    // 5 seconds - when actively interacting
  NORMAL: 15000, // 15 seconds - normal operation
  SLOW: 60000,   // 60 seconds - when idle
  ERROR: 30000,  // 30 seconds - when there are errors
} as const;

let currentInterval: number | null = null;
let currentMode: keyof typeof POLLING_INTERVALS = "NORMAL";
let lastUserActivity = Date.now();
let consecutiveErrors = 0;

// Setup intelligent polling system (disabled by default for aquarium devices)
export function setupPolling(): number {
  // Update user activity tracking for potential future use
  setupActivityTracking();

  // Polling disabled by default - aquarium devices don't need frequent status updates
  // Status only changes when users explicitly modify configuration
  console.log("Polling disabled by default - status updates are event-driven");
  return 0; // Return 0 to indicate no polling active
}

function startPolling(mode: keyof typeof POLLING_INTERVALS): number {
  if (currentInterval) {
    clearInterval(currentInterval);
  }

  currentMode = mode;
  const interval = POLLING_INTERVALS[mode];

  console.log(`Starting polling in ${mode} mode (${interval}ms)`);

  currentInterval = window.setInterval(async () => {
    await performPollingUpdate();
  }, interval);

  return currentInterval;
}

async function performPollingUpdate(): Promise<void> {
  const { refreshDevices } = useActions();
  const devices = useDevices();

  try {
    // Only poll if we have devices to update
    if (devices.length === 0) {
      return;
    }

    // Check if any devices are currently loading
    const hasLoadingDevices = devices.some(device => device.isLoading);
    if (hasLoadingDevices) {
      console.log("Skipping poll - devices already loading");
      return;
    }

    console.log(`Polling ${devices.length} devices...`);
    await refreshDevices();

    // Reset error count on success
    consecutiveErrors = 0;

    // Adjust polling rate based on activity
    adjustPollingRate();

  } catch (error) {
    consecutiveErrors++;
    console.warn(`Polling failed (attempt ${consecutiveErrors}):`, error);

    // Slow down polling on repeated errors
    if (consecutiveErrors >= 3 && currentMode !== "ERROR") {
      startPolling("ERROR");
    }
  }
}

function adjustPollingRate(): void {
  const now = Date.now();
  const timeSinceActivity = now - lastUserActivity;

  let newMode: keyof typeof POLLING_INTERVALS;

  if (timeSinceActivity < 60000) { // Last minute
    newMode = "FAST";
  } else if (timeSinceActivity < 300000) { // Last 5 minutes
    newMode = "NORMAL";
  } else {
    newMode = "SLOW";
  }

  // Switch mode if different
  if (newMode !== currentMode) {
    console.log(`Switching polling from ${currentMode} to ${newMode} mode`);
    startPolling(newMode);
  }
}

function setupActivityTracking(): void {
  const updateActivity = () => {
    lastUserActivity = Date.now();
  };

  // Track various user interactions
  document.addEventListener('click', updateActivity);
  document.addEventListener('keydown', updateActivity);
  document.addEventListener('scroll', updateActivity);
  document.addEventListener('touchstart', updateActivity);

  // Track window focus/blur
  window.addEventListener('focus', () => {
    updateActivity();
    // Resume normal polling when window regains focus
    if (currentMode === "SLOW") {
      startPolling("NORMAL");
    }
  });

  window.addEventListener('blur', () => {
    // Slow down polling when window loses focus
    setTimeout(() => {
      if (document.hidden) {
        startPolling("SLOW");
      }
    }, 60000); // Wait 1 minute before slowing down
  });
}

// Manual polling controls
export function triggerImmediateRefresh(): void {
  // Switch to fast mode temporarily
  startPolling("FAST");

  // Reset to normal after 30 seconds
  setTimeout(() => {
    if (currentMode === "FAST") {
      startPolling("NORMAL");
    }
  }, 30000);
}

// Manual refresh controls
export async function manualRefresh(): Promise<void> {
  console.log("Manual device refresh requested");
  await performPollingUpdate();
}

export function enablePolling(mode: keyof typeof POLLING_INTERVALS = "SLOW"): number {
  console.log(`Enabling polling in ${mode} mode for health monitoring`);
  return startPolling(mode);
}

export function disablePolling(): void {
  if (currentInterval) {
    clearInterval(currentInterval);
    currentInterval = null;
    console.log("Polling disabled");
  }
}

// Get current polling status
export function getPollingStatus() {
  return {
    active: currentInterval !== null,
    mode: currentMode,
    interval: currentInterval ? POLLING_INTERVALS[currentMode] : 0,
    consecutiveErrors,
    lastActivity: lastUserActivity,
    disabledByDefault: true, // Indicate this is disabled by design
  };
}

// Cleanup polling
export function cleanupPolling(): void {
  if (currentInterval) {
    clearInterval(currentInterval);
    currentInterval = null;
  }

  // Remove event listeners
  document.removeEventListener('click', () => {});
  document.removeEventListener('keydown', () => {});
  document.removeEventListener('scroll', () => {});
  document.removeEventListener('touchstart', () => {});
}
