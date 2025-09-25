import axios from "axios";
import "./style.css";

type DeviceStatus = {
  device_type: string;
  raw_payload: string | null;
  parsed: Record<string, unknown> | null;
  updated_at: number;
  model_name?: string | null;
  connected?: boolean;
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

type ScanDevice = {
  address: string;
  name: string;
  product: string;
  device_type: string;
};

// Narrow types for doser parsed JSON we care about
type DoserHead = {
  mode: number;
  hour: number;
  minute: number;
  dosed_tenths_ml: number;
};

type DoserParsed = {
  weekday: number | null;
  hour: number | null;
  minute: number | null;
  heads: DoserHead[];
};

const app = document.querySelector<HTMLDivElement>("#app");

// Auto-refresh disabled: loads happen only when tabs are activated

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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function weekdayName(n: number | null | undefined): string {
  // 1..7 -> Monday..Sunday (per backend comments)
  const names = [
    "",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  if (!n || n < 1 || n > 7) return "";
  return names[n];
}

function formatDayTime(weekday: number | null | undefined, hour: number | null | undefined, minute: number | null | undefined): string {
  if (weekday && hour != null && minute != null) {
    return `${weekdayName(weekday)} ${pad2(hour)}:${pad2(minute)}`;
  }
  return "";
}

function renderNotice(
  message: string,
  variant: "info" | "warning" | "error" = "info"
): string {
  return `<div class="notice ${variant}"><p>${escapeHtml(message)}</p></div>`;
}

function renderParsedValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "<em>None</em>";
  }

  if (Array.isArray(value) || typeof value === "object") {
    return `<pre class="code-block">${escapeHtml(
      JSON.stringify(value, null, 2)
    )}</pre>`;
  }

  if (typeof value === "boolean") {
    return `<span class="badge ${value ? "success" : "warning"}">${
      value ? "true" : "false"
    }</span>`;
  }

  return `<code>${escapeHtml(String(value))}</code>`;
}

function renderParsedTable(parsed: Record<string, unknown> | null): string {
  if (!parsed) {
    return "<em>No decoded payload</em>";
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return "<em>No fields</em>";
  }

  const headerRow = entries
    .map(([key]) => `<th scope="col">${escapeHtml(key)}</th>`)
    .join("");
  const valueRow = entries
    .map(([, value]) => `<td>${renderParsedValue(value)}</td>`)
    .join("");

  return `
    <table class="parsed-table">
      <thead>
        <tr>${headerRow}</tr>
      </thead>
      <tbody>
        <tr>${valueRow}</tr>
      </tbody>
    </table>
  `;
}

function renderParsedRaw(parsed: Record<string, unknown> | null): string {
  if (!parsed) return "<em>No decoded payload</em>";
  return `<pre class="code-block">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
}

function renderDeviceCard({ address, status }: DeviceEntry): string {
  const raw = status.raw_payload
    ? `<code>${escapeHtml(status.raw_payload)}</code>`
    : "<em>No raw payload</em>";
  const connectedBadge = status.connected
    ? `<span class="badge success">connected</span>`
    : `<span class="badge warning">disconnected</span>`;

  return `
    <article class="device">
      <header>
        <h2>${escapeHtml(status.model_name || address)}</h2>
        <span class="badge">${escapeHtml(status.device_type)}</span>
        ${connectedBadge}
        <button class="btn reconnect-btn" data-address="${escapeHtml(address)}" title="(Re)connect to device">Reconnect</button>
        <button class="btn update-btn" data-address="${escapeHtml(address)}" title="Request a fresh status from the device">Update</button>
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
          <dd>
            <details class="payload-details">
              <summary>Decoded Payload</summary>
              <div class="payload-controls">
                <button class="btn copy-payload" data-address="${escapeHtml(address)}" title="Copy JSON">
                  <svg class="icon copy-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="5" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span class="btn-label">Copy</span>
                </button>
              </div>
              ${renderParsedRaw(status.parsed)}
            </details>
          </dd>
        </div>
      </dl>
    </article>
  `;
}

function renderDeviceCardCollapsed({ address, status }: DeviceEntry): string {
  const raw = status.raw_payload
    ? `<code>${escapeHtml(status.raw_payload)}</code>`
    : "<em>No raw payload</em>";
  const connectedBadge = status.connected
    ? `<span class="badge success">connected</span>`
    : `<span class="badge warning">disconnected</span>`;

  return `
    <details class="device device-details" data-address="${escapeHtml(address)}">
      <summary>
        <div class="device-summary-left">
          <h2>${escapeHtml(status.model_name || address)}</h2>
          <span class="badge">${escapeHtml(status.device_type)}</span>
          ${connectedBadge}
        </div>
        <div class="device-summary-right">
          <button class="btn reconnect-btn" data-address="${escapeHtml(address)}" title="(Re)connect to device">Reconnect</button>
          <button class="btn update-btn" data-address="${escapeHtml(address)}" title="Request a fresh status from the device">Update</button>
        </div>
      </summary>
      <div class="device-body">
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
            <dd>
              <details class="payload-details">
                <summary>Decoded Payload</summary>
                <div class="payload-controls">
                  <button class="btn copy-payload" data-address="${escapeHtml(address)}" title="Copy JSON">
                    <svg class="icon copy-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="5" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span class="btn-label">Copy</span>
                  </button>
                </div>
                ${renderParsedRaw(status.parsed)}
              </details>
            </dd>
          </div>
        </dl>
      </div>
    </details>
  `;
}

function renderDeviceSection(
  entries: DeviceEntry[],
  emptyMessage: string
): string {
  if (entries.length === 0) {
    return `
      ${renderNotice(emptyMessage, "info")}
      <div class="scan-panel">
        <button class="btn" id="scan-btn" title="Scan for nearby devices">Scan for devices</button>
        <div id="scan-results"></div>
      </div>
    `;
  }

  // Overview should render collapsed device cards by default.
  return `<section class="device-grid">${entries
    .map((entry) => renderDeviceCardCollapsed(entry))
    .join("")}</section>`;
}

function renderDoserDashboard(entries: DeviceEntry[]): string {
  // Filter only dosers with parsed payload
  const dosers = entries.filter(
    (e) => e.status.device_type === "doser" && e.status.parsed
  );
  if (dosers.length === 0) {
    return renderNotice("No dosers connected yet.", "info");
  }

  const sections = dosers.map(({ address, status }) => {
    const parsed = status.parsed as unknown as DoserParsed;
    const header = formatDayTime(parsed?.weekday ?? null, parsed?.hour ?? null, parsed?.minute ?? null);
    const modelName = status.model_name || address;

    const heads = Array.isArray(parsed?.heads) ? parsed.heads : [];
    const rows = heads.slice(0, 4).map((h, idx) => {
      const pump = idx + 1;
      const mode = typeof h.mode === "number" ? h.mode : "";
      const sched = (typeof h.hour === "number" && typeof h.minute === "number")
        ? `${pad2(h.hour)}:${pad2(h.minute)}`
        : "";
      const dosed = typeof h.dosed_tenths_ml === "number"
        ? `${(h.dosed_tenths_ml / 10).toFixed(1)} ml`
        : "";
      return `<tr>
        <td>${pump}</td>
        <td>${mode}</td>
        <td>${sched}</td>
        <td>${dosed}</td>
      </tr>`;
    }).join("");

    return `
      <article class="device">
        <header>
          <h2>${escapeHtml(modelName)}</h2>
          <span class="badge">doser</span>
          ${status.connected ? `<span class="badge ${status.connected ? 'success' : 'warning'}">${status.connected ? 'connected' : 'disconnected'}</span>` : ''}
          <button class="btn reconnect-btn" data-address="${escapeHtml(address)}" title="(Re)connect to device">Reconnect</button>
          <button class="btn update-btn" data-address="${escapeHtml(address)}" title="Request a fresh status from the device">Update</button>
        </header>
        <div class="row-top">${header ? escapeHtml(header) : ""}</div>
        <table class="parsed-table">
          <thead>
            <tr>
              <th scope="col">pump</th>
              <th scope="col">mode</th>
              <th scope="col">scheduled</th>
              <th scope="col">dosed</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </article>
    `;
  });

  return `<section class="device-grid">${sections.join("")}</section>`;
}

// Narrow types for light parsed JSON
type LightKeyframe = { hour: number; minute: number; value: number; percent?: number };
type LightParsed = {
  weekday: number | null;
  current_hour: number | null;
  current_minute: number | null;
  keyframes: LightKeyframe[];
};

function toHexByte(n: number): string {
  const clamped = Math.max(0, Math.min(255, Math.floor(n)));
  return `0x${clamped.toString(16).toUpperCase().padStart(2, "0")}`;
}

function valueToPercent(n: number): number {
  // Backend value is 0..255; percent is approx n/255*100 rounded
  const p = Math.round((n / 255) * 100);
  return Math.max(0, Math.min(100, p));
}

function renderLightDashboard(entries: DeviceEntry[]): string {
  const lights = entries.filter(
    (e) => e.status.device_type === "light" && e.status.parsed
  );
  if (lights.length === 0) {
    return renderNotice("No lights connected yet.", "info");
  }

  const sections = lights.map(({ address, status }) => {
    const parsed = status.parsed as unknown as LightParsed;
    const header = formatDayTime(
      parsed?.weekday ?? null,
      parsed?.current_hour ?? null,
      parsed?.current_minute ?? null
    );
    const modelName = status.model_name || address;
    const frames = Array.isArray(parsed?.keyframes) ? parsed.keyframes : [];
    const rows = frames
      .map((f) => {
        const time =
          typeof f.hour === "number" && typeof f.minute === "number"
            ? `${pad2(f.hour)}:${pad2(f.minute)}`
            : "";
        // Prefer explicit percent provided by the backend. Fall back to
        // converting the raw 0..255 value to percent if needed for
        // compatibility with older backends.
        const val =
          typeof f.percent === "number"
            ? f.percent
            : typeof f.value === "number"
            ? valueToPercent(f.value)
            : 0;
        return `<tr>
        <td>${time}</td>
        <td>${val}%</td>
      </tr>`;
      })
      .join("");

    return `
      <article class="device">
        <header>
          <h2>${escapeHtml(modelName)}</h2>
          <span class="badge">light</span>
          ${status.connected ? `<span class="badge ${status.connected ? 'success' : 'warning'}">${status.connected ? 'connected' : 'disconnected'}</span>` : ''}
          <button class="btn reconnect-btn" data-address="${escapeHtml(address)}" title="(Re)connect to device">Reconnect</button>
          <button class="btn update-btn" data-address="${escapeHtml(address)}" title="Request a fresh status from the device">Update</button>
        </header>
        <div class="row-top">${header ? escapeHtml(header) : ""}</div>
        <table class="parsed-table">
          <thead>
            <tr>
              <th scope="col">time</th>
              <th scope="col">brightness</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </article>
    `;
  });

  return `<section class="device-grid">${sections.join("")}</section>`;
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
  if (!app) return;

  app.innerHTML = `
    <header class="app-header">
      <h1>Chihiros Device Manager</h1>
    </header>

    <nav class="tabs" role="tablist" aria-label="Views">
      <button class="tab active" role="tab" id="tab-dashboard" aria-selected="true" aria-controls="panel-dashboard">Dashboard</button>
      <button class="tab" role="tab" id="tab-overview" aria-selected="false" aria-controls="panel-overview">Overview</button>
      <div class="spacer"></div>
    </nav>

    <main>
      <section id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard">
        <div id="dashboard-content">${renderNotice("Loading dashboard…")}</div>
      </section>
      <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
        <div id="overview-content">${renderNotice("Loading overview…")}</div>
      </section>
    </main>
  `;
}

function setupTabs(): void {
  const tabDashboard = document.getElementById("tab-dashboard") as HTMLButtonElement | null;
  const tabOverview = document.getElementById("tab-overview") as HTMLButtonElement | null;
  const panelDashboard = document.getElementById("panel-dashboard");
  const panelOverview = document.getElementById("panel-overview");
  if (!tabDashboard || !tabOverview || !panelDashboard || !panelOverview) return;

  // Narrow to non-null for use inside nested functions
  const tDashboard = tabDashboard as HTMLButtonElement;
  const tOverview = tabOverview as HTMLButtonElement;
  const pDashboard = panelDashboard as HTMLElement;
  const pOverview = panelOverview as HTMLElement;

  // No timers when switching tabs

  function setActive(tab: "dashboard" | "overview") {
    const isDashboard = tab === "dashboard";
    const isOverview = tab === "overview";

  tDashboard.classList.toggle("active", isDashboard);
  tDashboard.setAttribute("aria-selected", isDashboard ? "true" : "false");
  tOverview.classList.toggle("active", isOverview);
  tOverview.setAttribute("aria-selected", isOverview ? "true" : "false");
  pDashboard.toggleAttribute("hidden", !isDashboard);
  pOverview.toggleAttribute("hidden", !isOverview);

    if (isDashboard) {
      void loadDashboard();
    } else if (isOverview) {
      void loadOverview();
    }
  }

  tDashboard.addEventListener("click", () => setActive("dashboard"));
  tOverview.addEventListener("click", () => setActive("overview"));
}

function setupInteractions(): void {
  // No refresh buttons for now
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function loadOverview(): Promise<void> {
  const container = document.getElementById("overview-content");
  if (!container) return;

  container.innerHTML = renderNotice("Loading overview…");
  try {
    const data = await fetchJson<StatusResponse>("/api/status");
    const entries = statusResponseToEntries(data).sort((a, b) =>
      a.address.localeCompare(b.address)
    );
    container.innerHTML = renderDeviceSection(
      entries,
      "No devices connected yet."
    );

    // If empty, wire up Scan button to discover and connect
    if (entries.length === 0) {
      const scanBtn = container.querySelector<HTMLButtonElement>("#scan-btn");
      const resultsDiv = container.querySelector<HTMLDivElement>("#scan-results");
      if (scanBtn && resultsDiv) {
        scanBtn.addEventListener("click", async () => {
          scanBtn.disabled = true;
          scanBtn.textContent = "Scanning…";
          try {
            const found = await fetchJson<ScanDevice[]>("/api/scan");
            if (found.length === 0) {
              resultsDiv.innerHTML = renderNotice("No supported devices found.", "warning");
            } else {
              resultsDiv.innerHTML = `
                <ul class="scan-list">
                  ${found
                    .map(
                      (d) => `
                        <li>
                          <code>${escapeHtml(d.address)}</code> — ${escapeHtml(d.product || d.name)}
                          <button class="btn connect-btn" data-address="${escapeHtml(d.address)}">Connect</button>
                        </li>`
                    )
                    .join("")}
                </ul>`;
              const connectBtns = resultsDiv.querySelectorAll<HTMLButtonElement>(".connect-btn");
              connectBtns.forEach((btn) => {
                btn.addEventListener("click", async () => {
                  const address = btn.dataset.address;
                  if (!address) return;
                  const prev = btn.textContent;
                  btn.disabled = true;
                  btn.textContent = "Connecting…";
                  try {
                    await postJson(`/api/devices/${encodeURIComponent(address)}/connect`);
                    // After connecting, refresh overview to show the device
                    void loadOverview();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Failed to connect.";
                    alert(msg);
                  } finally {
                    btn.disabled = false;
                    btn.textContent = prev || "Connect";
                  }
                });
              });
            }
          } catch (err) {
            resultsDiv.innerHTML = renderNotice(
              err instanceof Error ? err.message : "Scan failed.",
              "error"
            );
          } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = "Scan for devices";
          }
        });
      }
    }

    // Wire up Update buttons
    const buttons = container.querySelectorAll<HTMLButtonElement>(".update-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const address = btn.dataset.address;
        if (!address) return;
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Updating…";
        try {
          await postJson(`/api/devices/${encodeURIComponent(address)}/status`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to update device.";
          // Minimal inline feedback; could be improved later
          alert(msg);
        } finally {
          btn.disabled = false;
          btn.textContent = prev || "Update";
          // Re-render the overview to show fresh data
          void loadOverview();
        }
      });
    });
    // Wire up Reconnect buttons
    const reconnects = container.querySelectorAll<HTMLButtonElement>(".reconnect-btn");
    reconnects.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const address = btn.dataset.address;
        if (!address) return;
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Connecting…";
        try {
          await postJson(`/api/devices/${encodeURIComponent(address)}/connect`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to reconnect device.";
          alert(msg);
        } finally {
          btn.disabled = false;
          btn.textContent = prev || "Reconnect";
          void loadOverview();
        }
      });
    });
    // Wire up Copy JSON buttons inside payload details
    const copyBtns = container.querySelectorAll<HTMLButtonElement>(".copy-payload");
    copyBtns.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const address = btn.dataset.address;
        if (!address) return;
        const label = btn.querySelector<HTMLSpanElement>(".btn-label");
        const prev = label ? label.textContent : btn.textContent;
        try {
          const details = btn.closest(".device-details");
          if (!details) return;
          const pre = details.querySelector("pre.code-block");
          if (!pre) return;
          const text = pre.textContent || "";
          await navigator.clipboard.writeText(text);
          if (label) label.textContent = "Copied";
        } catch (err) {
          if (label) label.textContent = "Failed";
        } finally {
          setTimeout(() => {
            if (label) label.textContent = prev || "Copy";
          }, 1200);
        }
      });
    });
  } catch (err) {
    container.innerHTML = renderNotice(
      err instanceof Error ? err.message : "Failed to load overview.",
      "error"
    );
  }
}

async function loadDashboard(): Promise<void> {
  const container = document.getElementById("dashboard-content");
  if (!container) return;

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
      const scanBtn = container.querySelector<HTMLButtonElement>("#scan-btn");
      const resultsDiv = container.querySelector<HTMLDivElement>("#scan-results");
      if (scanBtn && resultsDiv) {
        scanBtn.addEventListener("click", async () => {
          scanBtn.disabled = true;
          scanBtn.textContent = "Scanning…";
          try {
            const found = await fetchJson<ScanDevice[]>("/api/scan");
            if (found.length === 0) {
              resultsDiv.innerHTML = renderNotice("No supported devices found.", "warning");
            } else {
              resultsDiv.innerHTML = `
                <ul class="scan-list">
                  ${found
                    .map(
                      (d) => `
                        <li>
                          <code>${escapeHtml(d.address)}</code> — ${escapeHtml(d.product || d.name)}
                          <button class="btn connect-btn" data-address="${escapeHtml(d.address)}">Connect</button>
                        </li>`
                    )
                    .join("")}
                </ul>`;
              const connectBtns = resultsDiv.querySelectorAll<HTMLButtonElement>(".connect-btn");
              connectBtns.forEach((btn) => {
                btn.addEventListener("click", async () => {
                  const address = btn.dataset.address;
                  if (!address) return;
                  const prev = btn.textContent;
                  btn.disabled = true;
                  btn.textContent = "Connecting…";
                  try {
                    await postJson(`/api/devices/${encodeURIComponent(address)}/connect`);
                    void loadDashboard();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Failed to connect.";
                    alert(msg);
                  } finally {
                    btn.disabled = false;
                    btn.textContent = prev || "Connect";
                  }
                });
              });
            }
          } catch (err) {
            resultsDiv.innerHTML = renderNotice(
              err instanceof Error ? err.message : "Scan failed.",
              "error"
            );
          } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = "Scan for devices";
          }
        });
      }
      return;
    }

    const doserHtml = renderDoserDashboard(entries);
    const lightHtml = renderLightDashboard(entries);
    container.innerHTML = `${doserHtml}${lightHtml}`;
      // Delegated wiring for reconnect/update inside dashboard
      // Update buttons
      const dashUpdateBtns = container.querySelectorAll<HTMLButtonElement>(".update-btn");
      dashUpdateBtns.forEach((btn) => {
        btn.addEventListener("click", async () => {
          const address = btn.dataset.address;
          if (!address) return;
          const prev = btn.textContent;
          btn.disabled = true;
          btn.textContent = "Updating…";
          try {
            await postJson(`/api/devices/${encodeURIComponent(address)}/status`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to update device.";
            alert(msg);
          } finally {
            btn.disabled = false;
            btn.textContent = prev || "Update";
            void loadDashboard();
          }
        });
      });
      // Reconnect buttons
      const dashReconnects = container.querySelectorAll<HTMLButtonElement>(".reconnect-btn");
      dashReconnects.forEach((btn) => {
        btn.addEventListener("click", async () => {
          const address = btn.dataset.address;
          if (!address) return;
          const prev = btn.textContent;
          btn.disabled = true;
          btn.textContent = "Connecting…";
          try {
            await postJson(`/api/devices/${encodeURIComponent(address)}/connect`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to reconnect device.";
            alert(msg);
          } finally {
            btn.disabled = false;
            btn.textContent = prev || "Reconnect";
            void loadDashboard();
          }
        });
      });
      // Copy JSON buttons in dashboard
      const dashCopyBtns = container.querySelectorAll<HTMLButtonElement>(".copy-payload");
      dashCopyBtns.forEach((btn) => {
        btn.addEventListener("click", async () => {
          const label = btn.querySelector<HTMLSpanElement>(".btn-label");
          const prev = label ? label.textContent : btn.textContent;
          try {
            const details = btn.closest(".device");
            if (!details) return;
            const pre = details.querySelector("pre.code-block");
            if (!pre) return;
            const text = pre.textContent || "";
            await navigator.clipboard.writeText(text);
            if (label) label.textContent = "Copied";
          } catch (err) {
            if (label) label.textContent = "Failed";
          } finally {
            setTimeout(() => {
              if (label) label.textContent = prev || "Copy";
            }, 1200);
          }
        });
      });
  } catch (err) {
    container.innerHTML = renderNotice(
      err instanceof Error ? err.message : "Failed to load dashboard.",
      "error"
    );
  }
}


function initialize(): void {
  renderLayout();
  setupTabs();
  setupInteractions();
  // Default to the new Dashboard tab
  const tab = document.getElementById("tab-dashboard");
  tab?.dispatchEvent(new Event("click"));
}

initialize();
