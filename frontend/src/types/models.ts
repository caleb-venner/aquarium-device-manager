// Enhanced TypeScript interfaces matching backend models
// This file provides complete type definitions for the Chihiros Device Manager SPA

// ========================================
// COMPREHENSIVE DEVICE TYPE DEFINITIONS
// ========================================

// Re-export comprehensive device structures
export type { Weekday } from './doser'; // Use doser's Weekday as the canonical one
export * from './doser';
export type {
  ChannelDef,
  ChannelLevels,
  LightDevice,
  ManualProfile,
  CustomPoint,
  CustomProfile,
  AutoProgram,
  AutoProfile,
  Profile,
  Interp
} from './light';

// ========================================
// BACKEND MODEL INTERFACES
// ========================================

/** Matches Python CommandStatus Literal */
export type CommandStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "timed_out"
  | "cancelled";

/** Matches Python CommandRecord dataclass */
export interface CommandRecord {
  id: string;
  address: string;
  action: string;
  args: Record<string, unknown> | null;
  status: CommandStatus;
  attempts: number;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  timeout: number;
}

/** Matches Python CommandRequest model */
export interface CommandRequest {
  id?: string;
  action: string;
  args?: Record<string, unknown>;
  timeout?: number;
}

/** Matches cached_status_to_dict output structure */
export interface CachedStatus {
  address: string;
  device_type: "light" | "doser";
  raw_payload: string | null;
  parsed: DoserParsed | LightParsed | null;
  updated_at: number;
  model_name: string | null;
  connected: boolean;
  channels: LightChannel[] | null;
}

// ========================================
// DEVICE-SPECIFIC INTERFACES
// ========================================

/** Light device channel definition */
export interface LightChannel {
  index: number;
  name: string;
}

/** Light device parsed status (matches serialize_light_status) */
export interface LightParsed {
  message_id: number;
  response_mode: number;
  weekday: number | null;
  current_hour: number | null;
  current_minute: number | null;
  keyframes: LightKeyframe[];
  time_markers: number[];
  tail: string; // hex string
}

/** Light keyframe with computed percentage */
export interface LightKeyframe {
  index: number;
  timestamp: number;
  value: number | null;
  percent: number; // computed percentage (0-100)
}

/** Doser head information */
export interface DoserHead {
  mode: number;
  hour: number;
  minute: number;
  dosed_tenths_ml: number;
  extra: string; // hex string
  mode_label: string; // human-friendly mode name
}

/** Doser device parsed status (matches serialize_doser_status) */
export interface DoserParsed {
  weekday: number | null;
  hour: number | null;
  minute: number | null;
  heads: DoserHead[];
  tail_raw: string; // hex string
  lifetime_totals_tenths_ml: number[]; // lifetime totals in tenths of mL for each head
}

// ========================================
// API RESPONSE INTERFACES
// ========================================

/** Main status endpoint response */
export interface StatusResponse {
  [address: string]: CachedStatus;
}

/** Debug live status response */
export interface LiveStatusResponse {
  statuses: (CachedStatus & { address: string })[];
  errors: string[];
}

/** Device scan result */
export interface ScanDevice {
  address: string;
  name: string;
  product: string;
  device_type: "light" | "doser";
}

// ========================================
// COMMAND ARGUMENT INTERFACES
// ========================================

/** Arguments for set_brightness command */
export interface SetBrightnessArgs {
  brightness: number; // 0-100
  color: number; // 0-5, channel index
}

/** Arguments for add_auto_setting command */
export interface AddAutoSettingArgs {
  sunrise: string; // HH:MM format
  sunset: string; // HH:MM format
  brightness?: number; // 0-100, for single channel (legacy)
  channels?: Record<string, number>; // Per-channel brightness values
  ramp_up_minutes?: number; // default 0
  weekdays?: string[]; // e.g., ["monday", "tuesday"]
}

/** Arguments for set_schedule command (doser) */
export interface SetScheduleArgs {
  head_index: number; // 0-3
  volume_tenths_ml: number; // 0-255
  hour: number; // 0-23
  minute: number; // 0-59
  weekdays?: string[]; // e.g., ["monday", "tuesday"]
  confirm?: boolean; // default true
  wait_seconds?: number; // default 2.0
}

// ========================================
// UI STATE INTERFACES
// ========================================

/** Individual device state for UI */
export interface DeviceState {
  address: string;
  status: CachedStatus;
  lastUpdated: number;
  isLoading: boolean;
  error: string | null;
  commandHistory: CommandRecord[];
}

/** Command queue entry */
export interface QueuedCommand {
  id: string;
  address: string;
  request: CommandRequest;
  queuedAt: number;
  retryCount: number;
}

/** Application-wide UI state */
export interface UIState {
  currentView: "dashboard" | "overview" | "dev";
  isScanning: boolean;
  scanResults: ScanDevice[];
  globalError: string | null;
  notifications: Notification[];
}

/** User notification */
export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: number;
  autoHide?: boolean;
}

// ========================================
// UTILITY TYPES
// ========================================

/** Helper type for device entries */
export interface DeviceEntry {
  address: string;
  status: CachedStatus;
}

/** Form data for manual brightness control */
export interface ManualBrightnessPayload {
  index: number;
  value: number;
}

/** Form data for manual brightness control */
export interface ManualBrightnessPayload {
  index: number;
  value: number;
}

// ========================================
// LEGACY COMPATIBILITY
// ========================================

/** Legacy DeviceStatus interface for backwards compatibility */
export interface DeviceStatus {
  device_type: string;
  raw_payload: string | null;
  parsed: Record<string, unknown> | null;
  updated_at: number;
  model_name?: string | null;
  connected?: boolean;
  channels?: LightChannel[] | null;
}

// ========================================
// TYPE GUARDS
// ========================================

export function isLightDevice(device: CachedStatus): device is CachedStatus & { device_type: "light" } {
  return device.device_type === "light";
}

export function isDoserDevice(device: CachedStatus): device is CachedStatus & { device_type: "doser" } {
  return device.device_type === "doser";
}

export function isLightParsed(parsed: unknown): parsed is LightParsed {
  return typeof parsed === "object" && parsed !== null && "keyframes" in parsed;
}

export function isDoserParsed(parsed: unknown): parsed is DoserParsed {
  return typeof parsed === "object" && parsed !== null && "heads" in parsed;
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/** Convert StatusResponse to DeviceEntry array */
export function statusResponseToEntries(data: StatusResponse): DeviceEntry[] {
  return Object.entries(data).map(([address, status]) => ({
    address,
    status,
  }));
}

/** Convert debug statuses to DeviceEntry array */
export function debugStatusesToEntries(statuses: (CachedStatus & { address: string })[]): DeviceEntry[] {
  return statuses.map((status) => ({
    address: status.address,
    status,
  }));
}

/** Check if command is complete */
export function isCommandComplete(command: CommandRecord): boolean {
  return ["success", "failed", "timed_out", "cancelled"].includes(command.status);
}

/** Check if command was successful */
export function isCommandSuccessful(command: CommandRecord): boolean {
  return command.status === "success";
}

/** Get human-readable command status */
export function getCommandStatusLabel(status: CommandStatus): string {
  switch (status) {
    case "pending": return "Pending";
    case "running": return "Running";
    case "success": return "Success";
    case "failed": return "Failed";
    case "timed_out": return "Timed Out";
    case "cancelled": return "Cancelled";
    default: return "Unknown";
  }
}

/** Convert lifetime totals from tenths of mL to mL */
export function getLifetimeTotalsInMl(parsed: DoserParsed): number[] {
  return parsed.lifetime_totals_tenths_ml.map(tenths => tenths / 10);
}
