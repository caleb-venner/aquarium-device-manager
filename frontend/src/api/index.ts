// Consolidated API module - exports all API functions

// HTTP utilities
export { fetchJson, postJson, putJson, deleteJson } from "./http";

// Command system
export {
  executeCommand,
  getCommandHistory,
  getCommand,
  sendManualBrightnessCommands,
  turnLightOn,
  turnLightOff,
  enableAutoMode,
  setManualMode,
  resetAutoSettings,
  addAutoSetting,
} from "./commands";

// Device management
export {
  getDeviceStatus,
  getLiveStatus,
  scanDevices,
  connectDevice,
  disconnectDevice,
  refreshDeviceStatus
} from "./devices";

// Legacy endpoints (for backwards compatibility)
export * from "./legacy";
