/**
 * Production Dashboard - Main Entry Point
 *
 * This is the production-ready dashboard that will be the foundation for the first release.
 * Features:
 * - Device configuration management (view, edit, delete)
 * - Saved configuration profiles
 * - Enhanced device management with naming and grouping
 * - Clean, professional UI
 */

import { renderProductionDashboard, initializeDashboardHandlers } from "./ui/aquarium-dashboard/dashboard";
import { createNotificationSystem } from "./ui/notifications";
import "./ui/productionDashboard.css";

// Initialize the production dashboard
async function init() {
  try {
    console.log("🚀 Initializing Production Dashboard...");

    const appElement = document.getElementById("app");
    if (!appElement) {
      throw new Error("App element not found");
    }

    // Initialize notification system
    createNotificationSystem();

    // Initialize dashboard handlers
    initializeDashboardHandlers();

    // Render the dashboard
    appElement.innerHTML = renderProductionDashboard();

    console.log("✅ Production Dashboard initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Production Dashboard:", error);

    const appElement = document.getElementById("app");
    if (appElement) {
      appElement.innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h1 style="color: #dc2626;">Failed to Load Dashboard</h1>
          <p style="color: #64748b;">${error instanceof Error ? error.message : String(error)}</p>
          <button
            onclick="location.reload()"
            style="padding: 10px 20px; margin-top: 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;"
          >
            Retry
          </button>
        </div>
      `;
    }
  }
}

// Start the application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
