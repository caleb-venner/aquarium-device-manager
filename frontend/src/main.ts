import axios from "axios";
import "./style.css";

type DeviceStatus = {
  device_type: string;
  raw_payload: string | null;
  parsed: Record<string, unknown> | null;
  updated_at: number;
};

type StatusResponse = Record<string, DeviceStatus>;

type DeviceEntry = {
  address: string;
  status: DeviceStatus;
};

type DebugStatus = DeviceStatus & { address: string };

type LiveStatusResponse = {
  statuses: DebugStatus[];
  errors: string[];
};

const app = document.querySelector<HTMLDivElement>("#app");
let hasLoadedLive = false;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

function renderNotice(
  message: string,
  variant: "info" | "warning" | "error" = "info"
): string {
  return `<div class="notice ${variant}"><p>${escapeHtml(message)}</p></div>`;
}

function renderParsedValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "<em>—</em>";
  }

  if (Array.isArray(value) || typeof value === "object") {
    return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }

  if (typeof value === "boolean") {
    return `<span class="boolean">${value ? "True" : "False"}</span>`;
  }

  return `<code>${escapeHtml(String(value))}</code>`;
}

function renderParsedTable(parsed: Record<string, unknown> | null): string {
  if (!parsed) {
    return "<em>No parsed payload</em>";
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return "<em>No parsed payload</em>";
  }

  const rows = entries
    .map(
      ([key, value]) =>
        `<tr><th>${escapeHtml(key)}</th><td>${renderParsedValue(value)}</td></tr>`
    )
    .join("");

  return `<table class="parsed-table"><tbody>${rows}</tbody></table>`;
}

function renderDeviceCard({ address, status }: DeviceEntry): string {
  const raw = status.raw_payload
    ? `<code>${escapeHtml(status.raw_payload)}</code>`
    : "<em>No raw payload</em>";

  return `
    <article class="device">
      <header>
        <h2>${escapeHtml(address)}</h2>
        <span class="badge">${escapeHtml(status.device_type)}</span>
      </header>
      <dl>
        <div>
          <dt>Last Update</dt>
          <dd>${formatTimestamp(status.updated_at)}</dd>
        </div>
        <div>
          <dt>Raw Payload</dt>
          <dd>${raw}</dd>
        </div>
        <div>
          <dt>Decoded Payload</dt>
          <dd>${renderParsedTable(status.parsed)}</dd>
        </div>
      </dl>
    </article>
  `;
}

function renderDeviceSection(
  entries: DeviceEntry[],
  emptyMessage: string
): string {
  if (entries.length === 0) {
    return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  }

  return `<section class="device-grid">${entries
    .map((entry) => renderDeviceCard(entry))
    .join("")}</section>`;
}

function statusResponseToEntries(data: StatusResponse): DeviceEntry[] {
  return Object.entries(data).map(([address, status]) => ({
    address,
    status,
  }));
}

function debugStatusesToEntries(statuses: DebugStatus[]): DeviceEntry[] {
  return statuses.map(
    ({ address, device_type, raw_payload, parsed, updated_at }) => ({
      address,
      status: {
        device_type,
        raw_payload,
        parsed,
        updated_at,
      },
    })
  );
}

function renderLayout(): void {
  if (!app) {
    return;
  }

  app.innerHTML = `
    <main>
      <header class="page-header">
        <h1>Chihiros Device Manager</h1>
        <button id="refresh-overview" type="button">Refresh</button>
      </header>
      <nav class="tabs" role="tablist">
        <button
          class="tab-button active"
          type="button"
          role="tab"
          aria-selected="true"
          aria-controls="tab-overview"
          data-tab="overview"
        >
          Overview
        </button>
        <button
          class="tab-button"
          type="button"
          role="tab"
          aria-selected="false"
          aria-controls="tab-debug"
          data-tab="debug"
        >
          Debug
        </button>
      </nav>
      <section id="tab-overview" class="tab-panel active" role="tabpanel">
        <div id="overview-content" class="tab-content">
          <p class="muted">Loading status…</p>
        </div>
      </section>
      <section id="tab-debug" class="tab-panel" role="tabpanel" hidden>
        <div class="debug-section">
          <header class="debug-section__header">
            <h2>Live Payloads</h2>
            <button id="refresh-live" type="button">Request Live Payloads</button>
          </header>
          <p class="muted">
            Fetch current payloads from connected devices without persisting them.
          </p>
          <div id="live-status-content" class="tab-content muted">
            No live data requested yet.
          </div>
        </div>
        <div class="debug-section">
          <header class="debug-section__header">
            <h2>Cached Snapshot</h2>
          </header>
          <p class="muted">Latest saved device state loaded from JSON storage.</p>
          <div id="cached-status-content" class="tab-content">
            <p class="muted">Loading snapshot…</p>
          </div>
        </div>
      </section>
    </main>
  `;
}

function setupTabs(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".tab-button");
  const panels = document.querySelectorAll<HTMLElement>(".tab-panel");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      if (!tab || button.classList.contains("active")) {
        return;
      }

      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      panels.forEach((panel) => {
        const isActive = panel.id === `tab-${tab}`;
        panel.classList.toggle("active", isActive);
        if (isActive) {
          panel.removeAttribute("hidden");
        } else {
          panel.setAttribute("hidden", "true");
        }
      });

      if (tab === "debug" && !hasLoadedLive) {
        hasLoadedLive = true;
        void loadLiveStatus();
      }
    });
  });
}

function setupInteractions(): void {
  setupTabs();

  const refreshOverview = document.querySelector<HTMLButtonElement>(
    "#refresh-overview"
  );
  if (refreshOverview) {
    refreshOverview.addEventListener("click", () => {
      void loadOverview();
    });
  }

  const refreshLive = document.querySelector<HTMLButtonElement>("#refresh-live");
  if (refreshLive) {
    refreshLive.addEventListener("click", () => {
      void loadLiveStatus();
    });
  }
}

async function loadOverview(): Promise<void> {
  const overviewContainer = document.querySelector<HTMLDivElement>(
    "#overview-content"
  );
  const cachedContainer = document.querySelector<HTMLDivElement>(
    "#cached-status-content"
  );
  if (!overviewContainer || !cachedContainer) {
    return;
  }

  overviewContainer.innerHTML = "<p class=\"muted\">Loading status…</p>";
  cachedContainer.innerHTML = "<p class=\"muted\">Loading snapshot…</p>";

  try {
    const response = await axios.get<StatusResponse>("/api/status");
    const entries = statusResponseToEntries(response.data);
    overviewContainer.innerHTML = renderDeviceSection(
      entries,
      "No devices are currently connected."
    );
    cachedContainer.innerHTML = renderDeviceSection(
      entries,
      "No cached device state is available."
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error fetching status";
    const notice = renderNotice(message, "error");
    overviewContainer.innerHTML = notice;
    cachedContainer.innerHTML = notice;
  }
}

async function loadLiveStatus(): Promise<void> {
  const container = document.querySelector<HTMLDivElement>(
    "#live-status-content"
  );
  if (!container) {
    return;
  }

  container.innerHTML = "<p class=\"muted\">Requesting live payloads…</p>";

  try {
    const response = await axios.post<LiveStatusResponse>(
      "/api/debug/live-status"
    );
    const { statuses, errors } = response.data;
    const entries = debugStatusesToEntries(statuses);

    const parts: string[] = [];
    if (errors.length > 0) {
      const errorHtml = errors
        .map((message) => `<p>${escapeHtml(message)}</p>`)
        .join("");
      parts.push(`<div class="notice warning">${errorHtml}</div>`);
    }

    parts.push(
      renderDeviceSection(entries, "No live payloads available for connected devices.")
    );

    container.classList.remove("muted");
    container.innerHTML = parts.join("\n");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch live payloads";
    container.innerHTML = renderNotice(message, "error");
  }
}

function initialize(): void {
  if (!app) {
    return;
  }

  renderLayout();
  setupInteractions();
  void loadOverview();
}

initialize();
