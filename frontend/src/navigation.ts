// Tab navigation and view management

import type { DeviceEntry, StatusResponse } from "./types/models";
import { statusResponseToEntries } from "./types/models";
import { renderNotice } from "./utils";
import { fetchJson, postJson } from "./api";
import { renderDoserDashboard, renderLightDashboard } from "./ui/dashboards";
import { renderHeaderNavigation, renderFooterNavigation } from "./ui/pageNavigation";

// Simple caching to prevent excessive API calls during navigation
let dashboardLoaded = false;
let overviewLoaded = false;
let lastDashboardLoad = 0;
let lastOverviewLoad = 0;
const CACHE_DURATION = 5000; // 5 seconds

export function renderLayout(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="modern-app legacy-app">
      <header class="modern-header">
        <div class="header-content">
          <div class="brand">
            <h1>🛠️ Dev Tools</h1>
            <span class="version">Legacy dashboard utilities & diagnostics</span>
          </div>
          <div class="header-actions">
            ${renderHeaderNavigation("dev")}
          </div>
        </div>
      </header>

      <div class="modern-main legacy-main">
        <div class="legacy-content">
          <nav class="tabs" role="tablist" aria-label="Views">
            <button class="tab active" role="tab" id="tab-dashboard" aria-selected="true" aria-controls="panel-dashboard">Dashboard</button>
            <button class="tab" role="tab" id="tab-overview" aria-selected="false" aria-controls="panel-overview">Overview</button>
            <button class="tab" role="tab" id="tab-dev" aria-selected="false" aria-controls="panel-dev">Dev</button>
            <div class="spacer"></div>
          </nav>

          <div class="legacy-panels">
            <section id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard">
              <div id="dashboard-content">${renderNotice("Loading dashboard…")}</div>
            </section>
            <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
              <div id="overview-content">${renderNotice("Loading overview…")}</div>
            </section>
            <section id="panel-dev" role="tabpanel" aria-labelledby="tab-dev" hidden>
              <div id="dev-content">${renderNotice("Preparing developer tools…")}</div>
            </section>
          </div>
        </div>
      </div>

      <footer class="modern-footer">
        <div class="footer-content">
          <span class="footer-info">Developer diagnostics • Legacy dashboard utilities</span>
          <div class="footer-links">
            ${renderFooterNavigation("dev")}
          </div>
        </div>
      </footer>
    </div>
  `;
}

export function setupTabs(): void {
  const tabDashboard = document.getElementById("tab-dashboard") as HTMLButtonElement | null;
  const tabOverview = document.getElementById("tab-overview") as HTMLButtonElement | null;
  const tabDev = document.getElementById("tab-dev") as HTMLButtonElement | null;
  const panelDashboard = document.getElementById("panel-dashboard");
  const panelOverview = document.getElementById("panel-overview");
  const panelDev = document.getElementById("panel-dev");
  if (!tabDashboard || !tabOverview || !tabDev || !panelDashboard || !panelOverview || !panelDev) return;

  const tDashboard = tabDashboard as HTMLButtonElement;
  const tOverview = tabOverview as HTMLButtonElement;
  const tDev = tabDev as HTMLButtonElement;
  const pDashboard = panelDashboard as HTMLElement;
  const pOverview = panelOverview as HTMLElement;
  const pDev = panelDev as HTMLElement;

  function applyState(tab: HTMLButtonElement, panel: HTMLElement, active: boolean) {
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    if (active) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "true");
    }
  }

  function setActive(tab: "dashboard" | "overview" | "dev") {
    const isDashboard = tab === "dashboard";
    const isOverview = tab === "overview";
    const isDev = tab === "dev";

    applyState(tDashboard, pDashboard, isDashboard);
    applyState(tOverview, pOverview, isOverview);
    applyState(tDev, pDev, isDev);

    if (isDashboard) {
      void loadDashboard();
    } else if (isOverview) {
      void loadOverview();
    } else if (isDev) {
      void loadDevView();
    }
  }

  tDashboard.addEventListener("click", () => setActive("dashboard"));
  tOverview.addEventListener("click", () => setActive("overview"));
  tDev.addEventListener("click", () => setActive("dev"));

  // Load the default Dashboard view on initial page render only.
  void loadDashboard();
}

async function loadDashboard(force = false): Promise<void> {
  const container = document.getElementById("dashboard-content");
  if (!container) return;

  const now = Date.now();
  if (!force && dashboardLoaded && (now - lastDashboardLoad) < CACHE_DURATION) {
    return;
  }

  dashboardLoaded = false;

  container.innerHTML = renderNotice("Loading dashboard…");
  try {
    const data = await fetchJson<StatusResponse>("/api/status");
    const entries = statusResponseToEntries(data).sort((a, b) =>
      a.address.localeCompare(b.address)
    );
    if (entries.length === 0) {
      container.innerHTML = `
        ${renderNotice("No devices connected yet.", "info")}
        <div class="scan-panel">
          <button class="btn" id="scan-btn" title="Scan for nearby devices">Scan for devices</button>
          <div id="scan-results"></div>
        </div>`;
      setupScanPanel(container);
    } else {
      renderDashboardContent(entries, container);
    }

    dashboardLoaded = true;
    lastDashboardLoad = Date.now();
  } catch (err) {
    dashboardLoaded = false;
    lastDashboardLoad = 0;
    container.innerHTML = renderNotice(
      err instanceof Error ? err.message : "Failed to load dashboard.",
      "error"
    );
  }
}

function setupScanPanel(container: HTMLElement): void {
  const scanBtn = container.querySelector<HTMLButtonElement>("#scan-btn");
  const resultsDiv = container.querySelector<HTMLDivElement>("#scan-results");
  if (!scanBtn || !resultsDiv) return;

  scanBtn.addEventListener("click", async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = "Scanning…";
    try {
      const found = await fetchJson<import("./types/models").ScanDevice[]>("/api/scan");
      if (found.length === 0) {
        resultsDiv.innerHTML = renderNotice("No supported devices found.", "warning");
      } else {
        resultsDiv.innerHTML = `
          <ul class="scan-list">
            ${found
              .map(
                (d) => `
                  <li>
                    <code>${d.address}</code> — ${d.product || d.name}
                    <button class="btn connect-btn" data-address="${d.address}">Connect</button>
                  </li>`
              )
              .join("")}
          </ul>`;
        setupConnectButtons(resultsDiv);
      }
    } catch (err) {
      resultsDiv.innerHTML = renderNotice(
        err instanceof Error ? err.message : "Failed to scan for devices.",
        "error"
      );
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = "Scan for devices";
    }
  });
}

function setupConnectButtons(container: HTMLElement): void {
  const connectBtns = container.querySelectorAll<HTMLButtonElement>(".connect-btn");
  connectBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const address = btn.dataset.address;
      if (!address) return;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Connecting…";
      try {
        await import("./api").then(api => api.postJson(`/api/devices/${encodeURIComponent(address)}/connect`, {}));
        void loadDashboard(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to connect to device.";
        alert(msg);
      } finally {
        btn.disabled = false;
        btn.textContent = prev || "Connect";
      }
    });
  });
}

function renderDashboardContent(entries: DeviceEntry[], container: HTMLElement): void {
  const dosers = entries.filter((entry) => entry.status.device_type === "doser");
  const lights = entries.filter((entry) => entry.status.device_type === "light");

  container.innerHTML = `
    <div class="tab-content">
      ${dosers.length > 0 ? `<section>${renderDoserDashboard(dosers)}</section>` : ""}
      ${lights.length > 0 ? `<section>${renderLightDashboard(lights)}</section>` : ""}
    </div>
  `;

  setupDashboardButtons(container);
}

function setupDashboardButtons(container: HTMLElement): void {
  // Setup update buttons
  const dashUpdates = container.querySelectorAll<HTMLButtonElement>(".update-btn");
  dashUpdates.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const address = btn.dataset.address;
      if (!address) return;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Updating…";
      try {
        await import("./api").then(api => api.postJson(`/api/devices/${encodeURIComponent(address)}/status`, {}));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update device.";
        alert(msg);
      } finally {
        btn.disabled = false;
        btn.textContent = prev || "Update";
        void loadDashboard(true);
      }
    });
  });

  // Setup reconnect buttons
  const dashReconnects = container.querySelectorAll<HTMLButtonElement>(".reconnect-btn");
  dashReconnects.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const address = btn.dataset.address;
      if (!address) return;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Connecting…";
      try {
        await import("./api").then(api => api.postJson(`/api/devices/${encodeURIComponent(address)}/connect`, {}));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to reconnect to device.";
        alert(msg);
      } finally {
        btn.disabled = false;
        btn.textContent = prev || "Reconnect";
        void loadDashboard(true);
      }
    });
  });
}

async function loadOverview(force = false): Promise<void> {
  const container = document.getElementById("overview-content");
  if (!container) return;

  const now = Date.now();
  if (!force && overviewLoaded && (now - lastOverviewLoad) < CACHE_DURATION) {
    return;
  }

  overviewLoaded = false;

  container.innerHTML = renderNotice("Loading overview…");
  try {
    const response = await postJson<import("./types/models").LiveStatusResponse>("/api/debug/live-status");
    const { debugStatusesToEntries } = await import("./types/models");
    const entries = debugStatusesToEntries(response.statuses);
    const errorNotices = response.errors.map((error) =>
      renderNotice(error, "error")
    );

    const deviceCardModule = await import("./ui/deviceCard");
    const deviceSection = entries.length > 0
      ? deviceCardModule.renderDeviceSection(entries, "No devices connected.")
      : renderNotice("No device statuses available.", "info");

    container.innerHTML = `
      <div class="tab-content">
        ${errorNotices.join("")}
        <section>${deviceSection}</section>
      </div>
    `;

    overviewLoaded = true;
    lastOverviewLoad = Date.now();
  } catch (err) {
    overviewLoaded = false;
    lastOverviewLoad = 0;
    container.innerHTML = renderNotice(
      err instanceof Error ? err.message : "Failed to load overview.",
      "error"
    );
  }
}

async function loadDevView(): Promise<void> {
  const container = document.getElementById("dev-content");
  if (!container) return;

  try {
    const devToolsModule = await import("./dev-tools");
    await devToolsModule.loadDevTools();
  } catch (err) {
    container.innerHTML = renderNotice(
      err instanceof Error ? err.message : "Failed to load developer tools.",
      "error"
    );
  }
}

export function setupInteractions(): void {
  // No refresh buttons for now
}
