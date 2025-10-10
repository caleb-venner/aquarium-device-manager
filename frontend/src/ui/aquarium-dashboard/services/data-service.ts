/**
 * Dashboard data service - handles all API calls and data loading
 */

import {
  getDoserConfigurations,
  getLightConfigurations,
  getConfigurationSummary,
  listDoserMetadata,
  listLightMetadata,
  type ConfigurationSummary,
} from "../../../api/configurations";
import { getDeviceStatus } from "../../../api/devices";
import type { StatusResponse } from "../../../types/models";
import type { DoserDevice, LightDevice, DeviceMetadata, LightMetadata } from "../../../api/configurations";
import {
  setDoserConfigs,
  setLightConfigs,
  setDoserMetadata,
  setLightMetadata,
  setSummary,
  setDeviceStatus,
  setError,
  markDeviceStable,
  markDeviceUnstable,
  getDashboardState,
} from "../state";

/**
 * Load all dashboard data from APIs
 */
export async function loadAllDashboardData(): Promise<void> {
  setError(null);

  try {
    // Load configurations, metadata, and device status in parallel
    const results = await Promise.allSettled([
      getDoserConfigurations(),
      getLightConfigurations(),
      getConfigurationSummary(),
      getDeviceStatus(),
      listDoserMetadata(),
      listLightMetadata(),
    ]);

    // Handle doser configs
    if (results[0].status === "fulfilled") {
      setDoserConfigs(results[0].value);
    } else {
      console.error("❌ Failed to load doser configs:", results[0].reason);
      setDoserConfigs([]);
    }

    // Handle light configs
    if (results[1].status === "fulfilled") {
      setLightConfigs(results[1].value);
    } else {
      console.error("❌ Failed to load light configs:", results[1].reason);
      setLightConfigs([]);
    }

    // Handle summary (gracefully fail if it errors)
    if (results[2].status === "fulfilled") {
      setSummary(results[2].value);
    } else {
      console.error("❌ Failed to load summary:", results[2].reason);
      // Create a fallback summary from the configs we did load
      const doserConfigs = results[0].status === "fulfilled" ? results[0].value : [];
      const lightConfigs = results[1].status === "fulfilled" ? results[1].value : [];
      const fallbackSummary: ConfigurationSummary = {
        total_configurations: doserConfigs.length + lightConfigs.length,
        dosers: {
          count: doserConfigs.length,
          addresses: doserConfigs.map(d => d.id),
        },
        lights: {
          count: lightConfigs.length,
          addresses: lightConfigs.map(d => d.id),
        },
        storage_paths: {
          doser_configs: "~/.chihiros/doser_configs.json",
          light_profiles: "~/.chihiros/light_profiles.json",
        },
      };
      setSummary(fallbackSummary);
    }

    // Handle device status
    if (results[3].status === "fulfilled") {
      const newStatus = results[3].value;
      const previousState = getDashboardState();
      const previousStatus = previousState.deviceStatus;

      setDeviceStatus(newStatus);

      // Track connection stability changes
      Object.entries(newStatus).forEach(([address, status]) => {
        const previousDeviceStatus = previousStatus?.[address];

        // If device just disconnected
        if (previousDeviceStatus?.connected && !status.connected) {
          markDeviceUnstable(address);
        }
        // If device is connected and was previously tracked as unstable, reset if it's been stable for a while
        else if (status.connected && previousDeviceStatus?.connected) {
          // Device has been consistently connected, mark as stable
          markDeviceStable(address);
        }
      });
    } else {
      console.error("❌ Failed to load device status:", results[3].reason);
      setDeviceStatus({});
    }

    // Handle doser metadata
    if (results[4].status === "fulfilled") {
      setDoserMetadata(results[4].value);
    } else {
      console.error("❌ Failed to load doser metadata:", results[4].reason);
      setDoserMetadata([]);
    }

    // Handle light metadata
    if (results[5].status === "fulfilled") {
      setLightMetadata(results[5].value);
    } else {
      console.error("❌ Failed to load light metadata:", results[5].reason);
      setLightMetadata([]);
    }

    const state = {
      dosers: results[0].status === "fulfilled" ? results[0].value.length : 0,
      lights: results[1].status === "fulfilled" ? results[1].value.length : 0,
      devices: results[3].status === "fulfilled" ? Object.keys(results[3].value).length : 0,
      doserMetadata: results[4].status === "fulfilled" ? results[4].value.length : 0,
      lightMetadata: results[5].status === "fulfilled" ? results[5].value.length : 0,
      summary: results[2].status === "fulfilled" ? "loaded" : "fallback"
    };

    console.log("✅ Loaded dashboard data:", state);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("❌ Failed to load dashboard data:", errorMessage);
    setError(`Failed to load dashboard data: ${errorMessage}`);
    // Ensure deviceStatus is set to empty object so UI shows "no devices" instead of "no data"
    setDeviceStatus({});
  }
}
