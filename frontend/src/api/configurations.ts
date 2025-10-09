// API client for device configuration management

import { fetchJson, putJson, deleteJson } from "./http";

// ============================================================================
// Type Definitions
// ============================================================================

// Doser Types
export interface DoserHead {
  index: number;
  active: boolean;
  schedule: any; // Complex schedule object
  recurrence: any; // Recurrence pattern
  missedDoseCompensation: boolean;
  calibration: any; // Calibration data
}

export interface DoserDevice {
  id: string;
  name?: string;
  timezone: string;
  configurations: any[]; // Complex configuration structure
  activeConfigurationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Light Types
export interface LightChannel {
  key: string;
  label?: string;
  min: number;
  max: number;
  step: number;
}

export interface AutoSetting {
  time: string;
  brightness: number;
}

export interface LightProfile {
  mode: "manual" | "custom" | "auto";
  levels?: Record<string, number>; // For manual mode
  points?: any[]; // For custom mode
  programs?: any[]; // For auto mode
}

export interface LightDevice {
  id: string;
  name?: string;
  timezone: string;
  channels: LightChannel[];
  configurations: any[]; // Complex configuration structure
  activeConfigurationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfigurationSummary {
  total_configurations: number;
  dosers: {
    count: number;
    addresses: string[];
  };
  lights: {
    count: number;
    addresses: string[];
  };
  storage_paths: {
    doser_configs: string;
    light_profiles: string;
  };
}

// ============================================================================
// Doser Configuration API
// ============================================================================

/**
 * Get all saved doser configurations
 */
export async function getDoserConfigurations(): Promise<DoserDevice[]> {
  return fetchJson<DoserDevice[]>("/api/configurations/dosers");
}

/**
 * Get a specific doser configuration by address
 */
export async function getDoserConfiguration(address: string): Promise<DoserDevice> {
  return fetchJson<DoserDevice>(`/api/configurations/dosers/${encodeURIComponent(address)}`);
}

/**
 * Update or create a doser configuration
 */
export async function updateDoserConfiguration(
  address: string,
  config: DoserDevice
): Promise<DoserDevice> {
  return putJson<DoserDevice>(
    `/api/configurations/dosers/${encodeURIComponent(address)}`,
    config
  );
}

/**
 * Delete a doser configuration
 */
export async function deleteDoserConfiguration(address: string): Promise<void> {
  await deleteJson(`/api/configurations/dosers/${encodeURIComponent(address)}`);
}

// ============================================================================
// Light Configuration API
// ============================================================================

/**
 * Get all saved light profiles
 */
export async function getLightConfigurations(): Promise<LightDevice[]> {
  return fetchJson<LightDevice[]>("/api/configurations/lights");
}

/**
 * Get a specific light profile by address
 */
export async function getLightConfiguration(address: string): Promise<LightDevice> {
  return fetchJson<LightDevice>(`/api/configurations/lights/${encodeURIComponent(address)}`);
}

/**
 * Update or create a light profile
 */
export async function updateLightConfiguration(
  address: string,
  config: LightDevice
): Promise<LightDevice> {
  return putJson<LightDevice>(
    `/api/configurations/lights/${encodeURIComponent(address)}`,
    config
  );
}

/**
 * Delete a light profile
 */
export async function deleteLightConfiguration(address: string): Promise<void> {
  await deleteJson(`/api/configurations/lights/${encodeURIComponent(address)}`);
}

// ============================================================================
// Configuration Summary API
// ============================================================================

/**
 * Get a summary of all stored configurations
 */
export async function getConfigurationSummary(): Promise<ConfigurationSummary> {
  return fetchJson<ConfigurationSummary>("/api/configurations/summary");
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a MAC address for display (e.g., "AA:BB:CC:DD:EE:FF")
 */
export function formatMacAddress(address: string): string {
  return address.toUpperCase();
}

/**
 * Get a short name for a device (last 4 characters of MAC address)
 */
export function getShortDeviceName(address: string): string {
  return address.slice(-5).replace(":", "").toUpperCase();
}

/**
 * Validate time format (HH:MM)
 */
export function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Sort auto settings by time
 */
export function sortAutoSettings(settings: AutoSetting[]): AutoSetting[] {
  return [...settings].sort((a, b) => {
    const [aHour, aMin] = a.time.split(":").map(Number);
    const [bHour, bMin] = b.time.split(":").map(Number);
    return aHour * 60 + aMin - (bHour * 60 + bMin);
  });
}

/**
 * Validate doser configuration
 */
export function validateDoserConfig(config: DoserDevice): string[] {
  const errors: string[] = [];

  if (!config.id) {
    errors.push("Device ID is required");
  }

  if (!config.timezone) {
    errors.push("Timezone is required");
  }

  if (!config.configurations || config.configurations.length === 0) {
    errors.push("At least one configuration must be present");
  }

  return errors;
}

/**
 * Validate light profile
 */
export function validateLightProfile(config: LightDevice): string[] {
  const errors: string[] = [];

  if (!config.id) {
    errors.push("Device ID is required");
  }

  if (!config.timezone) {
    errors.push("Timezone is required");
  }

  if (!config.channels || config.channels.length === 0) {
    errors.push("At least one channel must be defined");
  }

  if (!config.configurations || config.configurations.length === 0) {
    errors.push("At least one configuration must be present");
  }

  return errors;
}

// ============================================================================
// System Configuration API
// ============================================================================

export interface SystemTimezone {
  system_timezone: string;
  default_for_new_devices: string;
  note: string;
}

// Metadata Types
export interface DeviceMetadata {
  id: string;
  name?: string;
  timezone: string;
  headNames?: { [key: number]: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface LightMetadata {
  id: string;
  name?: string;
  timezone: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Get system timezone information
 */
export async function getSystemTimezone(): Promise<SystemTimezone> {
  return fetchJson<SystemTimezone>("/api/configurations/system/timezone");
}

// ============================================================================
// Metadata API Functions
// ============================================================================

/**
 * Update doser metadata (name only, no schedules)
 */
export async function updateDoserMetadata(address: string, metadata: DeviceMetadata): Promise<DeviceMetadata> {
  return putJson<DeviceMetadata>(`/api/configurations/dosers/${address}/metadata`, metadata);
}

/**
 * Get doser metadata by address
 */
export async function getDoserMetadata(address: string): Promise<DeviceMetadata | null> {
  return fetchJson<DeviceMetadata | null>(`/api/configurations/dosers/${address}/metadata`);
}

/**
 * Get all doser metadata
 */
export async function listDoserMetadata(): Promise<DeviceMetadata[]> {
  return fetchJson<DeviceMetadata[]>("/api/configurations/dosers/metadata");
}

/**
 * Update light metadata (name only, no schedules)
 */
export async function updateLightMetadata(address: string, metadata: LightMetadata): Promise<LightMetadata> {
  return putJson<LightMetadata>(`/api/configurations/lights/${address}/metadata`, metadata);
}

/**
 * Get light metadata by address
 */
export async function getLightMetadata(address: string): Promise<LightMetadata | null> {
  return fetchJson<LightMetadata | null>(`/api/configurations/lights/${address}/metadata`);
}

/**
 * Get all light metadata
 */
export async function listLightMetadata(): Promise<LightMetadata[]> {
  return fetchJson<LightMetadata[]>("/api/configurations/lights/metadata");
}
