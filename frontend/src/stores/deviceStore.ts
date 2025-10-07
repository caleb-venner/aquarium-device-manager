// Global state management using Zustand
// Centralizes device data, command queue, and UI state

import { createStore } from "zustand/vanilla";
import type { StateCreator, StoreApi } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  CachedStatus,
  DeviceState,
  QueuedCommand,
  UIState,
  CommandRecord,
  ScanDevice,
  Notification,
  CommandRequest,
} from "../types/models";

// ========================================
// STORE INTERFACES
// ========================================

interface DeviceStore {
  // Device state
  devices: Map<string, DeviceState>;

  // Command queue
  commandQueue: QueuedCommand[];
  isProcessingCommands: boolean;

  // UI state
  ui: UIState;

  // Actions
  actions: {
    // Device management
    setDevices: (devices: CachedStatus[]) => void;
    updateDevice: (address: string, status: CachedStatus) => void;
    setDeviceLoading: (address: string, loading: boolean) => void;
    setDeviceError: (address: string, error: string | null) => void;
    addCommandToHistory: (address: string, command: CommandRecord) => void;

    // Command queue management
    queueCommand: (address: string, request: CommandRequest) => Promise<string>;
    processCommandQueue: () => Promise<void>;
    retryCommand: (commandId: string) => void;
    cancelCommand: (commandId: string) => void;
    clearCommandQueue: () => void;

    // UI state management
    setCurrentView: (view: UIState["currentView"]) => void;
    setScanning: (scanning: boolean) => void;
    setScanResults: (results: ScanDevice[]) => void;
    setGlobalError: (error: string | null) => void;
    addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
    removeNotification: (id: string) => void;
    clearNotifications: () => void;

    // Data refresh
    refreshDevices: () => Promise<void>;
    refreshDevice: (address: string) => Promise<void>;
    scanForDevices: () => Promise<ScanDevice[]>;
    connectToDevice: (address: string) => Promise<void>;
  };
}

// ========================================
// STORE IMPLEMENTATION
// ========================================

const storeInitializer: StateCreator<DeviceStore> = (set, get) => ({
  // Initial state
  devices: new Map(),
  commandQueue: [],
  isProcessingCommands: false,
  ui: {
    currentView: "dashboard",
    isScanning: false,
    scanResults: [],
    globalError: null,
    notifications: [],
  },

  actions: {
      // Device management
      setDevices: (devices) => {
        const deviceMap = new Map<string, DeviceState>();
        devices.forEach((status) => {
          const existing = get().devices.get(status.address);
          deviceMap.set(status.address, {
            address: status.address,
            status,
            lastUpdated: Date.now(),
            isLoading: existing?.isLoading ?? false,
            error: null,
            commandHistory: existing?.commandHistory ?? [],
          });
        });
        set({ devices: deviceMap });
      },

      updateDevice: (address, status) => {
        const devices = new Map(get().devices);
        const existing = devices.get(address);
        devices.set(address, {
          address,
          status,
          lastUpdated: Date.now(),
          isLoading: false,
          error: null,
          commandHistory: existing?.commandHistory ?? [],
        });
        set({ devices });
      },

      setDeviceLoading: (address, loading) => {
        const devices = new Map(get().devices);
        const existing = devices.get(address);
        if (existing) {
          devices.set(address, { ...existing, isLoading: loading });
          set({ devices });
        }
      },

      setDeviceError: (address, error) => {
        const devices = new Map(get().devices);
        const existing = devices.get(address);
        if (existing) {
          devices.set(address, { ...existing, error, isLoading: false });
          set({ devices });
        }
      },

      addCommandToHistory: (address, command) => {
        const devices = new Map(get().devices);
        const existing = devices.get(address);
        if (existing) {
          const history = [command, ...existing.commandHistory].slice(0, 50); // Keep last 50
          devices.set(address, { ...existing, commandHistory: history });
          set({ devices });
        }
      },

      // Command queue management
      queueCommand: async (address, request) => {
        const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const queuedCommand: QueuedCommand = {
          id: commandId,
          address,
          request: { ...request, id: request.id || commandId },
          queuedAt: Date.now(),
          retryCount: 0,
        };

        set((state) => ({
          commandQueue: [...state.commandQueue, queuedCommand],
        }));

        // Auto-process if not already processing
        if (!get().isProcessingCommands) {
          await get().actions.processCommandQueue();
        }

        return commandId;
      },

      processCommandQueue: async () => {
        const { commandQueue, isProcessingCommands, actions } = get();

        if (isProcessingCommands || commandQueue.length === 0) {
          return;
        }

        set({ isProcessingCommands: true });

        try {
          while (get().commandQueue.length > 0) {
            const [nextCommand, ...remaining] = get().commandQueue;
            set({ commandQueue: remaining });

            try {
              // Set device as loading
              actions.setDeviceLoading(nextCommand.address, true);

              // Execute command via API
              const { executeCommand } = await import("../api/commands");
              const result = await executeCommand(nextCommand.address, nextCommand.request);

              // Add to command history
              actions.addCommandToHistory(nextCommand.address, result);

              // Refresh device status if command was successful
              if (result.status === "success") {
                await actions.refreshDevice(nextCommand.address);
              }

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";

              // Create failed command record
              const failedCommand: CommandRecord = {
                id: nextCommand.request.id || nextCommand.id,
                address: nextCommand.address,
                action: nextCommand.request.action,
                args: nextCommand.request.args || null,
                status: "failed",
                attempts: nextCommand.retryCount + 1,
                result: null,
                error: errorMessage,
                created_at: nextCommand.queuedAt,
                started_at: Date.now(),
                completed_at: Date.now(),
                timeout: nextCommand.request.timeout || 10,
              };

              actions.addCommandToHistory(nextCommand.address, failedCommand);
              actions.setDeviceError(nextCommand.address, errorMessage);
              actions.addNotification({
                type: "error",
                message: `Command failed: ${errorMessage}`,
                autoHide: true,
              });
            } finally {
              actions.setDeviceLoading(nextCommand.address, false);
            }
          }
        } finally {
          set({ isProcessingCommands: false });
        }
      },

      retryCommand: (commandId) => {
        const { commandQueue } = get();
        const command = commandQueue.find(cmd => cmd.id === commandId);
        if (command) {
          const retryCommand = {
            ...command,
            retryCount: command.retryCount + 1,
            queuedAt: Date.now(),
          };
          set({
            commandQueue: commandQueue.filter(cmd => cmd.id !== commandId).concat(retryCommand),
          });
        }
      },

      cancelCommand: (commandId) => {
        set((state) => ({
          commandQueue: state.commandQueue.filter(cmd => cmd.id !== commandId),
        }));
      },

      clearCommandQueue: () => {
        set({ commandQueue: [] });
      },

      // UI state management
      setCurrentView: (view) => {
        set((state) => ({
          ui: { ...state.ui, currentView: view },
        }));
      },

      setScanning: (scanning) => {
        set((state) => ({
          ui: { ...state.ui, isScanning: scanning },
        }));
      },

      setScanResults: (results) => {
        set((state) => ({
          ui: { ...state.ui, scanResults: results },
        }));
      },

      setGlobalError: (error) => {
        set((state) => ({
          ui: { ...state.ui, globalError: error },
        }));
      },

      addNotification: (notification) => {
        const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newNotification: Notification = {
          ...notification,
          id,
          timestamp: Date.now(),
        };

        set((state) => ({
          ui: {
            ...state.ui,
            notifications: [...state.ui.notifications, newNotification],
          },
        }));

        // Auto-remove after 5 seconds if autoHide is true
        if (notification.autoHide) {
          setTimeout(() => {
            get().actions.removeNotification(id);
          }, 5000);
        }
      },

      removeNotification: (id) => {
        set((state) => ({
          ui: {
            ...state.ui,
            notifications: state.ui.notifications.filter(n => n.id !== id),
          },
        }));
      },

      clearNotifications: () => {
        set((state) => ({
          ui: { ...state.ui, notifications: [] },
        }));
      },

      // Data refresh
      refreshDevices: async () => {
        try {
          const { fetchJson } = await import("../api/http");
          const data = await fetchJson<{ [address: string]: CachedStatus }>("/api/status");
          const devices = Object.values(data) as CachedStatus[];
          get().actions.setDevices(devices);
          get().actions.setGlobalError(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to refresh devices";
          get().actions.setGlobalError(message);
          throw error;
        }
      },

      refreshDevice: async (address) => {
        try {
          get().actions.setDeviceLoading(address, true);
          const { postJson } = await import("../api/http");
          await postJson(`/api/devices/${encodeURIComponent(address)}/status`, {});

          // Refresh all devices to get updated status
          await get().actions.refreshDevices();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to refresh device";
          get().actions.setDeviceError(address, message);
          throw error;
        }
      },

      scanForDevices: async () => {
        try {
          get().actions.setScanning(true);
          const { fetchJson } = await import("../api/http");
          const results = await fetchJson<ScanDevice[]>("/api/scan");
          get().actions.setScanResults(results);
          return results;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to scan for devices";
          get().actions.addNotification({
            type: "error",
            message,
            autoHide: true,
          });
          throw error;
        } finally {
          get().actions.setScanning(false);
        }
      },

      connectToDevice: async (address) => {
        try {
          const { postJson } = await import("../api/http");
          await postJson(`/api/devices/${encodeURIComponent(address)}/connect`, {});
          get().actions.addNotification({
            type: "success",
            message: `Connected to device ${address}`,
            autoHide: true,
          });

          // Refresh devices after connection
          await get().actions.refreshDevices();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to connect to device";
          get().actions.addNotification({
            type: "error",
            message: `Connection failed: ${message}`,
            autoHide: true,
          });
          throw error;
        }
      },
  },
});

const createDeviceStore = (): StoreApi<DeviceStore> =>
  createStore<DeviceStore>()(subscribeWithSelector(storeInitializer));

export const deviceStore = createDeviceStore();

// ========================================
// SELECTORS FOR EASY ACCESS
// ========================================

export const getDeviceStore = () => deviceStore;

export const useDevices = () =>
  Array.from(deviceStore.getState().devices.values());
export const useDevice = (address: string) =>
  deviceStore.getState().devices.get(address);
export const useCommandQueue = () => deviceStore.getState().commandQueue;
export const useUI = () => deviceStore.getState().ui;
export const useActions = () => deviceStore.getState().actions;

// Device type selectors
export const useLightDevices = () =>
  Array.from(deviceStore.getState().devices.values()).filter(
    (device) => device.status.device_type === "light",
  );

export const useDoserDevices = () =>
  Array.from(deviceStore.getState().devices.values()).filter(
    (device) => device.status.device_type === "doser",
  );

// UI state selectors
export const useCurrentView = () => deviceStore.getState().ui.currentView;
export const useNotifications = () => deviceStore.getState().ui.notifications;
export const useGlobalError = () => deviceStore.getState().ui.globalError;
