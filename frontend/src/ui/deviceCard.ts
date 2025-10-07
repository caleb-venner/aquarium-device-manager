import { escapeHtml, formatRawPayload, formatTimestamp, renderParsedRaw, renderNotice } from "../utils";

type LightChannel = {
  index: number;
  name: string;
};

// Use looser typing to avoid type conflicts
type DeviceStatus = {
  device_type: string;
  raw_payload: string | null;
  parsed: any; // Use 'any' temporarily to bypass type issues
  updated_at: number;
  model_name?: string | null;
  connected?: boolean;
  channels?: LightChannel[] | null;
};

type DeviceEntry = {
  address: string;
  status: DeviceStatus;
};

export function renderDeviceCard({ address, status }: DeviceEntry): string {
  const raw = status.raw_payload
    ? `<code>${escapeHtml(formatRawPayload(status.raw_payload))}</code>`
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

export function renderDeviceCardCollapsed({ address, status }: DeviceEntry): string {
  const raw = status.raw_payload
    ? `<code>${escapeHtml(formatRawPayload(status.raw_payload))}</code>`
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

export function renderDeviceSection(entries: DeviceEntry[], emptyMessage: string): string {
  if (entries.length === 0) {
    return `
      ${renderNotice(emptyMessage, "info")}
      <div class="scan-panel">
        <button class="btn" id="scan-btn" title="Scan for nearby devices">Scan for devices</button>
        <div id="scan-results"></div>
      </div>
    `;
  }

  return `<section class="device-grid">${entries.map((entry) => renderDeviceCardCollapsed(entry)).join("")}</section>`;
}
