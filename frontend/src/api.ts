export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// Import types
import type { CommandRecord, CommandRequest, ManualBrightnessPayload } from "./types";

// Command System API Functions

/**
 * Execute a command on a device using the unified command system
 */
export async function executeCommand(
  address: string,
  request: CommandRequest
): Promise<CommandRecord> {
  return postJson<CommandRecord>(`/api/devices/${encodeURIComponent(address)}/commands`, request);
}

/**
 * Get command history for a device
 */
export async function getCommandHistory(
  address: string,
  limit = 20
): Promise<CommandRecord[]> {
  return fetchJson<CommandRecord[]>(
    `/api/devices/${encodeURIComponent(address)}/commands?limit=${limit}`
  );
}

/**
 * Get a specific command by ID
 */
export async function getCommand(
  address: string,
  commandId: string
): Promise<CommandRecord> {
  return fetchJson<CommandRecord>(
    `/api/devices/${encodeURIComponent(address)}/commands/${encodeURIComponent(commandId)}`
  );
}

// Updated Manual Brightness Function using Command System
export async function sendManualBrightnessCommands(
  address: string,
  payloads: ManualBrightnessPayload[],
  post = postJson
): Promise<CommandRecord[]> {
  const sanitized = payloads
    .map(({ index, value }) => ({
      index: Number.isFinite(index) ? Math.trunc(index) : 0,
      value: Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0,
    }))
    .sort((a, b) => a.index - b.index);

  const commands: CommandRecord[] = [];

  for (const { index, value } of sanitized) {
    const command = await executeCommand(address, {
      action: "set_brightness",
      args: { brightness: value, color: index },
      timeout: 10
    });
    commands.push(command);
  }

  return commands;
}

// Device Control Functions using Command System

/**
 * Turn a light on
 */
export async function turnLightOn(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "turn_on", timeout: 10 });
}

/**
 * Turn a light off
 */
export async function turnLightOff(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "turn_off", timeout: 10 });
}

/**
 * Enable auto mode on a light
 */
export async function enableAutoMode(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "enable_auto_mode", timeout: 10 });
}

/**
 * Set manual mode on a light
 */
export async function setManualMode(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "set_manual_mode", timeout: 10 });
}

/**
 * Reset auto settings on a light
 */
export async function resetAutoSettings(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "reset_auto_settings", timeout: 15 });
}

/**
 * Add auto setting to a light
 */
export async function addAutoSetting(
  address: string,
  args: {
    sunrise: string;
    sunset: string;
    brightness: number;
    ramp_up_minutes?: number;
    weekdays?: number[];
  }
): Promise<CommandRecord> {
  return executeCommand(address, {
    action: "add_auto_setting",
    args,
    timeout: 15
  });
}

/**
 * Set doser schedule
 */
export async function setDoserSchedule(
  address: string,
  args: {
    head_index: number;
    volume_tenths_ml: number;
    hour: number;
    minute: number;
    weekdays?: number[];
    confirm?: boolean;
    wait_seconds?: number;
  }
): Promise<CommandRecord> {
  return executeCommand(address, {
    action: "set_schedule",
    args: { confirm: true, wait_seconds: 2.0, ...args },
    timeout: 20
  });
}
