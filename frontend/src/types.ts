// Type definitions for the Chihiros Device Manager frontend

export type LightChannel = {
  index: number;
  name: string;
};

export type ManualBrightnessPayload = {
  index: number;
  value: number;
};

export type DeviceStatus = {
  device_type: string;
  raw_payload: string | null;
  parsed: Record<string, unknown> | null;
  updated_at: number;
  model_name?: string | null;
  connected?: boolean;
  channels?: LightChannel[] | null;
};

export type StatusResponse = Record<string, DeviceStatus>;

export type DeviceEntry = {
  address: string;
  status: DeviceStatus;
};

export type DebugStatus = DeviceStatus & { address: string };

export type LiveStatusResponse = {
  statuses: DebugStatus[];
  errors: string[];
};

export type ScanDevice = {
  address: string;
  name: string;
  product: string;
  device_type: string;
};

// Narrow types for doser parsed JSON we care about
export type DoserHead = {
  mode: number;
  hour: number;
  minute: number;
  dosed_tenths_ml: number;
};

// Command system types
export type CommandStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "timed_out"
  | "cancelled";

export type CommandRecord = {
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
};

export type CommandRequest = {
  id?: string;
  action: string;
  args?: Record<string, unknown>;
  timeout?: number;
};

export type DoserParsed = {
  weekday: number | null;
  hour: number | null;
  minute: number | null;
  heads: DoserHead[];
};

// Utility functions for data conversion
export function statusResponseToEntries(data: StatusResponse): DeviceEntry[] {
  return Object.entries(data).map(([address, status]) => ({
    address,
    status,
  }));
}

export function debugStatusesToEntries(statuses: DebugStatus[]): DeviceEntry[] {
  return statuses.map((status) => ({
    address: status.address,
    status,
  }));
}
