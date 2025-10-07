import { escapeHtml, pad2, formatDayTime, formatTimestamp, renderNotice } from "../utils";
import type { DeviceEntry } from "../types/models";

// Use looser typing temporarily to avoid type conflicts during development
type AnyDeviceEntry = {
  address: string;
  status: {
    device_type: string;
    raw_payload: string | null;
    parsed: any; // Use 'any' temporarily to bypass type issues
    updated_at: number;
    model_name?: string | null;
    connected?: boolean;
  };
};

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

export function renderDoserDashboard(entries: AnyDeviceEntry[]): string {
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
    const rows = heads.slice(0, 4).map((h: any, idx: number) => {
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

type LightKeyframe = { hour: number; minute: number; value: number; percent?: number };
type LightParsed = {
  weekday: number | null;
  current_hour: number | null;
  current_minute: number | null;
  keyframes: LightKeyframe[];
};

function valueToPercent(n: number): number {
  const p = Math.round((n / 255) * 100);
  return Math.max(0, Math.min(100, p));
}

export function renderLightDashboard(entries: AnyDeviceEntry[]): string {
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
      .map((f: any) => {
        const time =
          typeof f.hour === "number" && typeof f.minute === "number"
            ? `${pad2(f.hour)}:${pad2(f.minute)}`
            : "";
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
