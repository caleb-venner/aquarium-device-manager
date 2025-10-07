import "./style.css";
import "./ui/modernDashboard.css";
import { renderLayout, setupTabs, setupInteractions } from "./navigation";
import { createNotificationSystem } from "./ui/notifications";
import { useActions } from "./stores/deviceStore";

// Application entry point - Legacy Dashboard (unchanged)
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize notification system
  createNotificationSystem();

  // Initialize layout and navigation
  renderLayout();
  setupTabs();
  setupInteractions();

  // Initialize device data
  const { refreshDevices } = useActions();
  try {
    await refreshDevices();
  } catch (error) {
    console.warn("Failed to load initial device data:", error);
  }
});
