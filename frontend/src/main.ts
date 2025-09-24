import axios from "axios";
import "./style.css";

type DeviceStatus = {
  device_type: string;
  raw_payload: string | null;
  parsed: Record<string, unknown> | null;
  updated_at: number;
};

type StatusResponse = Record<string, DeviceStatus>;

const app = document.querySelector<HTMLDivElement>("#app");

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

function renderStatus(data: StatusResponse): void {
  if (!app) {
    return;
  }

  const entries = Object.entries(data);
  if (entries.length === 0) {
    app.innerHTML = `
      <main class="empty">
        <h1>Chihiros Device Manager</h1>
        <p>No devices are currently connected.</p>
      </main>
    `;
    return;
  }

  const content = entries
    .map(([address, status]) => {
      const parsed = status.parsed
        ? `<pre>${JSON.stringify(status.parsed, null, 2)}</pre>`
        : "<em>No parsed payload</em>";

      const raw = status.raw_payload
        ? `<code>${status.raw_payload}</code>`
        : "<em>No raw payload</em>";

      return `
        <section class="device">
          <header>
            <h2>${address}</h2>
            <span class="badge">${status.device_type}</span>
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
              <dt>Parsed</dt>
              <dd>${parsed}</dd>
            </div>
          </dl>
        </section>
      `;
    })
    .join("\n");

  app.innerHTML = `
    <main>
      <header class="page-header">
        <h1>Chihiros Device Manager</h1>
        <button id="refresh">Refresh</button>
      </header>
      <section class="device-grid">${content}</section>
    </main>
  `;

  const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadStatus);
  }
}

function renderError(error: unknown): void {
  if (!app) {
    return;
  }

  const message =
    error instanceof Error ? error.message : "Unknown error fetching status";
  app.innerHTML = `
    <main class="error">
      <h1>Chihiros Device Manager</h1>
      <p>${message}</p>
      <button id="retry">Retry</button>
    </main>
  `;

  const retry = document.querySelector<HTMLButtonElement>("#retry");
  if (retry) {
    retry.addEventListener("click", loadStatus);
  }
}

async function loadStatus(): Promise<void> {
  try {
    const response = await axios.get<StatusResponse>("/api/status");
    renderStatus(response.data);
  } catch (error) {
    renderError(error);
  }
}

loadStatus().catch(renderError);
