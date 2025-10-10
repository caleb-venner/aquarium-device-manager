/**
 * Main dashboard rendering functions
 */

import { getDashboardState } from "./state";
import { renderOverviewTab } from "./tabs/overview-tab";
import { renderDevicesTab } from "./tabs/devices-tab";
import { renderDevTab } from "./tabs/dev-tab";

/**
 * Main render function for the production dashboard
 */
export function renderProductionDashboard(): string {
  return `
    <div class="production-dashboard">
      ${renderHeader()}
      ${renderNavigation()}
      <main class="prod-main">
        ${renderContent()}
      </main>
    </div>
  `;
}

/**
 * Render the dashboard header
 */
function renderHeader(): string {
  const state = getDashboardState();

  return `
    <header class="prod-header">
      <div class="header-content">
        <div class="header-left">
          <div class="header-title">
            <h1>Aquarium BLE Device Manager</h1>
            <p class="header-subtitle">Production Dashboard - Device Status & Configuration Management</p>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" onclick="window.handleRefreshAll()" ${state.isRefreshing ? 'disabled' : ''}>
            ${state.isRefreshing ? '<span class="scan-spinner"></span> Refreshing...' : 'Refresh All'}
          </button>
          <button class="btn btn-primary" onclick="window.handleScanDevices()" ${state.isScanning ? 'disabled' : ''}>
            ${state.isScanning ? '<span class="scan-spinner"></span> Scanning...' : '<span>📡</span> Scan Devices'}
          </button>
        </div>
      </div>
    </header>
  `;
}

/**
 * Render the navigation tabs
 */
function renderNavigation(): string {
  const state = getDashboardState();
  const connectedDevices = state.deviceStatus ? Object.keys(state.deviceStatus).length : 0;

  return `
    <nav class="prod-nav">
      <div class="nav-content">
        <button
          class="nav-tab ${state.currentTab === "overview" ? "active" : ""}"
          onclick="window.switchTab('overview')"
        >
          Overview
        </button>
        <button
          class="nav-tab ${state.currentTab === "devices" ? "active" : ""}"
          onclick="window.switchTab('devices')"
        >
          Devices
          <span class="nav-badge">${connectedDevices}</span>
        </button>
        <button
          class="nav-tab ${state.currentTab === "dev" ? "active" : ""}"
          onclick="window.switchTab('dev')"
        >
          Dev
        </button>
      </div>
    </nav>
  `;
}

/**
 * Render the main content area
 */
function renderContent(): string {
  const state = getDashboardState();

  if (state.isLoading) {
    return `
      <div class="loading-state">
        <div class="loading-spinner">🔄</div>
        <p>Loading dashboard data...</p>
      </div>
    `;
  }

  if (state.error) {
    return `
      <div class="error-state">
        <div class="error-icon">❌</div>
        <h2>Error Loading Dashboard</h2>
        <p>${state.error}</p>
        <button class="btn btn-primary" onclick="window.handleRefreshAll()">
          Try Again
        </button>
      </div>
    `;
  }

  return `
    <div class="tab-panel ${state.currentTab === "overview" ? "active" : ""}" id="overview-panel">
      ${renderOverviewTab()}
    </div>
    <div class="tab-panel ${state.currentTab === "devices" ? "active" : ""}" id="devices-panel">
      ${renderDevicesTab()}
    </div>
    <div class="tab-panel ${state.currentTab === "dev" ? "active" : ""}" id="dev-panel">
      ${renderDevTab()}
    </div>
  `;
}

/**
 * Refresh the dashboard UI
 */
export function refreshDashboard(): void {
  const dashboardElement = document.querySelector('.production-dashboard');
  if (dashboardElement) {
    dashboardElement.outerHTML = renderProductionDashboard();
  }
}
