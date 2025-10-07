// Legacy API endpoints for backwards compatibility
// These will be gradually replaced by the unified command system

import { postJson } from "./http";
import type { ManualBrightnessPayload } from "../types/models";

// Legacy light control endpoints
export async function setLightBrightness(
  address: string,
  payload: ManualBrightnessPayload
): Promise<void> {
  await postJson(`/api/lights/${encodeURIComponent(address)}/brightness`, payload);
}

export async function turnLightOn(address: string): Promise<void> {
  await postJson(`/api/lights/${encodeURIComponent(address)}/on`, {});
}

export async function turnLightOff(address: string): Promise<void> {
  await postJson(`/api/lights/${encodeURIComponent(address)}/off`, {});
}

export async function enableLightAuto(address: string): Promise<void> {
  await postJson(`/api/lights/${encodeURIComponent(address)}/auto/enable`, {});
}

export async function setLightManual(address: string): Promise<void> {
  await postJson(`/api/lights/${encodeURIComponent(address)}/auto/manual`, {});
}

export async function resetLightAuto(address: string): Promise<void> {
  await postJson(`/api/lights/${encodeURIComponent(address)}/auto/reset`, {});
}

// Legacy doser control endpoints
export async function setDoserSchedule(
  address: string,
  payload: unknown
): Promise<void> {
  await postJson(`/api/dosers/${encodeURIComponent(address)}/schedule`, payload);
}
