// Command system API functions

import { postJson, fetchJson } from "./http";
import type {
  CommandRecord,
  CommandRequest,
  ManualBrightnessPayload,
} from "../types/models";

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

/**
 * Convenience helper to send manual brightness commands via the command queue.
 */
export async function sendManualBrightnessCommands(
  address: string,
  payloads: ManualBrightnessPayload[],
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
      timeout: 10,
    });
    commands.push(command);
  }

  return commands;
}

export async function turnLightOn(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "turn_on", timeout: 10 });
}

export async function turnLightOff(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "turn_off", timeout: 10 });
}

export async function enableAutoMode(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "enable_auto_mode", timeout: 10 });
}

export async function setManualMode(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "set_manual_mode", timeout: 10 });
}

export async function resetAutoSettings(address: string): Promise<CommandRecord> {
  return executeCommand(address, { action: "reset_auto_settings", timeout: 15 });
}

export async function addAutoSetting(
  address: string,
  args: {
    sunrise: string;
    sunset: string;
    brightness?: number; // Legacy single channel
    channels?: Record<string, number>; // Multi-channel
    ramp_up_minutes?: number;
    weekdays?: number[];
  },
): Promise<CommandRecord> {
  return executeCommand(address, {
    action: "add_auto_setting",
    args,
    timeout: 15,
  });
}
