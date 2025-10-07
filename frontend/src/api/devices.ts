// Device management API functions

import { fetchJson, postJson } from "./http";
import type {
  CachedStatus,
  StatusResponse,
  LiveStatusResponse,
  ScanDevice
} from "../types/models";

/**
 * Get cached status for all devices
 */
export async function getDeviceStatus(): Promise<StatusResponse> {
  return fetchJson<StatusResponse>("/api/status");
}

/**
 * Get live status for all devices (debug endpoint)
 */
export async function getLiveStatus(): Promise<LiveStatusResponse> {
  return postJson<LiveStatusResponse>("/api/debug/live-status");
}

/**
 * Scan for nearby devices
 */
export async function scanDevices(): Promise<ScanDevice[]> {
  return fetchJson<ScanDevice[]>("/api/scan");
}

/**
 * Connect to a specific device
 */
export async function connectDevice(address: string): Promise<void> {
  await postJson(`/api/devices/${encodeURIComponent(address)}/connect`, {});
}

/**
 * Disconnect from a specific device
 */
export async function disconnectDevice(address: string): Promise<void> {
  await postJson(`/api/devices/${encodeURIComponent(address)}/disconnect`, {});
}

/**
 * Refresh status for a specific device
 */
export async function refreshDeviceStatus(address: string): Promise<void> {
  await postJson(`/api/devices/${encodeURIComponent(address)}/status`, {});
}
