import axios from "axios";
import "./style.css";
import { escapeHtml, pad2, formatRawPayload, formatTimestamp, formatDayTime, renderNotice } from "./utils";
import { fetchJson, postJson, sendManualBrightnessCommands } from "./api";
import { renderDeviceCard, renderDeviceCardCollapsed, renderDeviceSection } from "./ui/deviceCard";
import { renderDoserDashboard, renderLightDashboard } from "./ui/dashboards";

type LightChannel = {
  index: number;
  name: string;
};

type ManualBrightnessPayload = {
  index: number;
  value: number;
};

type DeviceStatus = {
  device_type: string;
  raw_payload: string | null;
  parsed: Record<string, unknown> | null;
  updated_at: number;
  model_name?: string | null;
  connected?: boolean;
  channels?: LightChannel[] | null;
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


// Device UI renderers are now in ui modules

function renderDevManualCard({ address, status }: DeviceEntry): string {
  const modelName = status.model_name || address;
  const connectedBadge = status.connected
    ? `<span class="badge success">connected</span>`
    : `<span class="badge warning">disconnected</span>`;
  const rawChannels = Array.isArray(status.channels) ? status.channels : [];
  const normalizedChannels = rawChannels
    .filter((channel): channel is LightChannel =>
      channel !== null && typeof channel === "object" && typeof channel.index === "number"
    )
    .map((channel) => ({
      index: channel.index,
      name:
        typeof channel.name === "string" && channel.name.trim().length > 0
          ? channel.name.trim()
          : `Channel ${channel.index + 1}`,
    }))
    .sort((a, b) => a.index - b.index);
  const hasChannels = normalizedChannels.length > 0;
  const datasetAttr = hasChannels
    ? ` data-channels="${escapeHtml(JSON.stringify(normalizedChannels))}"`
    : "";
  const channelCountControl = hasChannels
    ? ""
    : `<div class="form-field">
          <label>
            <span>Number of channels</span>
            <input type="number" name="channelCount" min="1" max="6" value="1" required />
          </label>
        </div>`;
  const channelHint = hasChannels
    ? `<p class="form-hint">Detected channels: ${normalizedChannels
        .map((channel) => escapeHtml(channel.name))
        .join(", ")}</p>`
    : "";

  return `
    <article class="device dev-card" data-address="${escapeHtml(address)}">
      <header>
        <h2>${escapeHtml(modelName)}</h2>
        <div class="device-meta">
          <span class="badge">light</span>
          ${connectedBadge}
        </div>
      </header>
      <form class="manual-command-form" data-address="${escapeHtml(address)}"${datasetAttr}>
        ${channelCountControl}
        ${channelHint}
        <div class="channel-fields" data-role="channel-fields"></div>
        <div class="form-actions">
          <button type="submit" class="btn set-manual-btn">Send</button>
        </div>
        <p class="form-feedback" role="status" aria-live="polite"></p>
      </form>
    </article>
  `;
}

function renderDevManualSection(entries: DeviceEntry[]): string {
  return `<section class="device-grid dev-tools">${entries
    .map((entry) => renderDevManualCard(entry))
    .join("")}</section>`;
}

function renderDevAutoCard({ address, status }: DeviceEntry): string {
  const modelName = status.model_name || address;
  const connectedBadge = status.connected
    ? `<span class="badge success">connected</span>`
    : `<span class="badge warning">disconnected</span>`;
  const rawChannels = Array.isArray(status.channels) ? status.channels : [];
  const normalizedChannels = rawChannels
    .filter((channel): channel is LightChannel =>
      channel !== null && typeof channel === "object" && typeof channel.index === "number"
    )
    .map((channel) => ({
      index: channel.index,
      name:
        typeof channel.name === "string" && channel.name.trim().length > 0
          ? channel.name.trim()
          : `Channel ${channel.index + 1}`,
    }))
    .sort((a, b) => a.index - b.index);
  const hasChannels = normalizedChannels.length > 0;
  const datasetAttr = hasChannels
    ? ` data-channels="${escapeHtml(JSON.stringify(normalizedChannels))}"`
    : "";
  const channelCountControl = hasChannels
    ? ""
    : `<div class="form-field">
          <label>
            <span>Number of channels</span>
            <input type="number" name="autoChannelCount" min="1" max="6" value="1" required />
          </label>
        </div>`;
  const channelHint = hasChannels
    ? `<p class="form-hint">Detected channels: ${normalizedChannels
        .map((channel) => escapeHtml(channel.name))
        .join(", ")}</p>`
    : "";

  return `
    <article class="device dev-card" data-address="${escapeHtml(address)}">
      <header>
        <h2>${escapeHtml(modelName)}</h2>
        <div class="device-meta">
          <span class="badge">light</span>
          ${connectedBadge}
        </div>
      </header>
      <form class="auto-setting-form" data-address="${escapeHtml(address)}"${datasetAttr}>
        <div class="auto-field-grid">
          <label class="form-field time-field">
            <span>Sunrise</span>
            <div class="time-inputs">
              <input type="number" name="sunriseHour" min="0" max="23" value="8" required />
              <span class="time-separator">:</span>
              <input type="number" name="sunriseMinute" min="0" max="59" value="0" required />
            </div>
          </label>
          <label class="form-field time-field">
            <span>Sunset</span>
            <div class="time-inputs">
              <input type="number" name="sunsetHour" min="0" max="23" value="20" required />
              <span class="time-separator">:</span>
              <input type="number" name="sunsetMinute" min="0" max="59" value="0" required />
            </div>
          </label>
          <label class="form-field">
            <span>Ramp-up (minutes)</span>
            <input type="number" name="ramp" min="0" max="150" value="0" />
          </label>
        </div>
        <fieldset class="weekday-fieldset">
          <legend>Weekdays</legend>
          <div class="weekday-options">
            <label><input type="checkbox" data-weekday value="everyday" checked />Everyday</label>
            <label><input type="checkbox" data-weekday value="monday" />Mon</label>
            <label><input type="checkbox" data-weekday value="tuesday" />Tue</label>
            <label><input type="checkbox" data-weekday value="wednesday" />Wed</label>
            <label><input type="checkbox" data-weekday value="thursday" />Thu</label>
            <label><input type="checkbox" data-weekday value="friday" />Fri</label>
            <label><input type="checkbox" data-weekday value="saturday" />Sat</label>
            <label><input type="checkbox" data-weekday value="sunday" />Sun</label>
          </div>
        </fieldset>
        ${channelCountControl}
        ${channelHint}
        <div class="channel-fields" data-role="auto-channel-fields"></div>
        <div class="form-actions auto-actions">
          <button type="submit" class="btn">Add Setting</button>
          <button type="button" class="btn auto-enable-btn">Enable Auto</button>
          <button type="button" class="btn auto-manual-btn">Set Manual</button>
          <button type="button" class="btn auto-reset-btn">Reset Auto</button>
        </div>
        <p class="form-feedback" role="status" aria-live="polite"></p>
      </form>
    </article>
  `;
}

function renderDevAutoSection(entries: DeviceEntry[]): string {
  return `<section class="device-grid dev-tools">${entries
    .map((entry) => renderDevAutoCard(entry))
    .join("")}</section>`;
}

function renderDevLightTabs(entries: DeviceEntry[]): string {
  return `
    <div class="dev-subtabs" role="tablist" aria-label="Light developer tools">
      <button class="dev-subtab active" role="tab" id="dev-tab-manual" aria-selected="true" aria-controls="dev-panel-manual">Manual</button>
      <button class="dev-subtab" role="tab" id="dev-tab-auto" aria-selected="false" aria-controls="dev-panel-auto">Auto</button>
    </div>
    <section id="dev-panel-manual" class="dev-subpanel" role="tabpanel" aria-labelledby="dev-tab-manual">
      ${renderDevManualSection(entries)}
    </section>
    <section id="dev-panel-auto" class="dev-subpanel" role="tabpanel" aria-labelledby="dev-tab-auto" hidden>
      ${renderDevAutoSection(entries)}
    </section>
  `;
}

function setupManualCommandForms(container: HTMLElement): void {
  const forms = container.querySelectorAll<HTMLFormElement>(".manual-command-form");
  forms.forEach((form) => {
    const channelFields = form.querySelector<HTMLDivElement>('[data-role="channel-fields"]');
    const feedback = form.querySelector<HTMLParagraphElement>(".form-feedback");
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const address = form.dataset.address;
    if (!channelFields || !submitBtn || !address) {
      return;
    }

    const channelInput = form.querySelector<HTMLInputElement>('input[name="channelCount"]');
    const parsedChannels: LightChannel[] = (() => {
      const raw = form.dataset.channels;
      if (!raw) return [];
      try {
        const data = JSON.parse(raw) as LightChannel[];
        if (!Array.isArray(data)) return [];
        return data
          .filter((channel): channel is LightChannel =>
            channel !== null && typeof channel === "object" && typeof channel.index === "number"
          )
          .map((channel) => ({
            index: channel.index,
            name:
              typeof channel.name === "string" && channel.name.trim().length > 0
                ? channel.name.trim()
                : `Channel ${channel.index + 1}`,
          }))
          .sort((a, b) => a.index - b.index);
      } catch {
        return [];
      }
    })();

    const renderChannels = (channels: LightChannel[]) => {
      const normalized = channels.map((channel, position) => ({
        index: Number.isFinite(channel.index) ? channel.index : position,
        name:
          typeof channel.name === "string" && channel.name.trim().length > 0
            ? channel.name.trim()
            : `Channel ${Number.isFinite(channel.index) ? channel.index + 1 : position + 1}`,
      }));
      channelFields.innerHTML = "";
      normalized.forEach((channel) => {
        const label = document.createElement("label");
        label.className = "form-field channel-field";
        const span = document.createElement("span");
        span.textContent = channel.name;
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.step = "1";
        input.value = "100";
        input.required = true;
        input.dataset.channelIndex = String(channel.index);
        input.dataset.channelName = channel.name;
        label.append(span, input);
        channelFields.appendChild(label);
      });
    };

    const clampChannelCount = (value: number) => {
      if (!Number.isFinite(value)) {
        return 1;
      }
      return Math.max(1, Math.min(6, Math.floor(value)));
    };

    const buildFromCount = (count: number) => {
      const generated = Array.from({ length: count }, (_, idx) => ({
        index: idx,
        name: `Channel ${idx + 1}`,
      }));
      renderChannels(generated);
    };

    if (parsedChannels.length > 0) {
      renderChannels(parsedChannels);
      if (channelInput) {
        channelInput.value = String(parsedChannels.length);
        channelInput.disabled = true;
        const wrapper = channelInput.closest(".form-field");
        if (wrapper instanceof HTMLElement) {
          wrapper.setAttribute("hidden", "true");
        }
      }
    } else {
      const initialCount = clampChannelCount(
        channelInput ? Number.parseInt(channelInput.value, 10) : Number.NaN
      );
      if (channelInput) {
        channelInput.value = String(initialCount);
      }
      buildFromCount(initialCount);
      if (channelInput) {
        channelInput.addEventListener("change", () => {
          const parsed = Number.parseInt(channelInput.value, 10);
          const count = clampChannelCount(parsed);
          channelInput.value = String(count);
          buildFromCount(count);
        });
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const inputs = Array.from(
        channelFields.querySelectorAll<HTMLInputElement>("input[data-channel-index]")
      );
      if (inputs.length === 0) {
        if (feedback) feedback.textContent = "Add at least one channel.";
        return;
      }

      const payloads: ManualBrightnessPayload[] = [];
      for (let idx = 0; idx < inputs.length; idx += 1) {
        const input = inputs[idx];
        const value = Number.parseInt(input.value, 10);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          if (feedback) feedback.textContent = "Brightness must be between 0 and 100.";
          input.focus();
          return;
        }
        const channelIndexRaw = Number.parseInt(input.dataset.channelIndex ?? "", 10);
        const targetIndex = Number.isFinite(channelIndexRaw) ? channelIndexRaw : idx;
        payloads.push({ index: targetIndex, value });
      }

      const previousChannelInputDisabled = channelInput?.disabled ?? false;
      submitBtn.disabled = true;
      if (channelInput) {
        channelInput.disabled = true;
      }
      inputs.forEach((input) => {
        input.disabled = true;
      });
      if (feedback) feedback.textContent = "Sending…";

      try {
        await sendManualBrightnessCommands(address, payloads);
        if (feedback) feedback.textContent = "Manual command sent successfully.";
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send command.";
        if (feedback) feedback.textContent = message;
      } finally {
        submitBtn.disabled = false;
        if (channelInput) {
          channelInput.disabled = previousChannelInputDisabled;
        }
        inputs.forEach((input) => {
          input.disabled = false;
        });
      }
    });

  });
}

function setupAutoSettingForms(container: HTMLElement): void {
  const forms = container.querySelectorAll<HTMLFormElement>(".auto-setting-form");
  forms.forEach((form) => {
    const channelFields = form.querySelector<HTMLDivElement>("[data-role=\"auto-channel-fields\"]");
    const feedback = form.querySelector<HTMLParagraphElement>(".form-feedback");
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const address = form.dataset.address;
    if (!channelFields || !submitBtn || !address) {
      return;
    }

    const channelInput = form.querySelector<HTMLInputElement>('input[name="autoChannelCount"]');
    const parsedChannels: LightChannel[] = (() => {
      const raw = form.dataset.channels;
      if (!raw) return [];
      try {
        const data = JSON.parse(raw) as LightChannel[];
        if (!Array.isArray(data)) return [];
        return data
          .filter((channel): channel is LightChannel =>
            channel !== null && typeof channel === "object" && typeof channel.index === "number"
          )
          .map((channel) => ({
            index: channel.index,
            name:
              typeof channel.name === "string" && channel.name.trim().length > 0
                ? channel.name.trim()
                : `Channel ${channel.index + 1}`,
          }))
          .sort((a, b) => a.index - b.index)
          .slice(0, 3);
      } catch {
        return [];
      }
    })();

    const renderChannels = (channels: LightChannel[]) => {
      const normalized = channels.map((channel, position) => ({
        index: Number.isFinite(channel.index) ? channel.index : position,
        name:
          typeof channel.name === "string" && channel.name.trim().length > 0
            ? channel.name.trim()
            : `Channel ${Number.isFinite(channel.index) ? channel.index + 1 : position + 1}`,
      }));
      channelFields.innerHTML = "";
      normalized.forEach((channel) => {
        const label = document.createElement("label");
        label.className = "form-field channel-field";
        const span = document.createElement("span");
        span.textContent = channel.name;
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.step = "1";
        input.value = "100";
        input.required = true;
        input.dataset.channelIndex = String(channel.index);
        input.dataset.channelName = channel.name;
        label.append(span, input);
        channelFields.appendChild(label);
      });
    };

    const clampChannelCount = (value: number) => {
      if (!Number.isFinite(value)) {
        return 1;
      }
      return Math.max(1, Math.min(3, Math.floor(value)));
    };

    const buildFromCount = (count: number) => {
      const limited = clampChannelCount(count);
      const generated = Array.from({ length: limited }, (_, idx) => ({
        index: idx,
        name: `Channel ${idx + 1}`,
      }));
      renderChannels(generated);
    };

    if (parsedChannels.length > 0) {
      renderChannels(parsedChannels);
      if (channelInput) {
        channelInput.value = String(parsedChannels.length);
        channelInput.disabled = true;
        const wrapper = channelInput.closest(".form-field");
        if (wrapper instanceof HTMLElement) {
          wrapper.setAttribute("hidden", "true");
        }
      }
    } else {
      const initialCount = clampChannelCount(
        channelInput ? Number.parseInt(channelInput.value, 10) : Number.NaN
      );
      if (channelInput) {
        channelInput.value = String(initialCount);
      }
      buildFromCount(initialCount);
      if (channelInput) {
        channelInput.addEventListener("change", () => {
          const parsed = Number.parseInt(channelInput.value, 10);
          const count = clampChannelCount(parsed);
          channelInput.value = String(count);
          buildFromCount(count);
        });
      }
    }

    const weekdayCheckboxes = Array.from(
      form.querySelectorAll<HTMLInputElement>("input[data-weekday]")
    );
    const everydayCheckbox = weekdayCheckboxes.find((cb) => cb.value === "everyday");
    weekdayCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (checkbox.value === "everyday" && checkbox.checked) {
          weekdayCheckboxes.forEach((cb) => {
            if (cb !== checkbox) {
              cb.checked = false;
            }
          });
        } else if (checkbox.checked && everydayCheckbox) {
          everydayCheckbox.checked = false;
        }
        if (!weekdayCheckboxes.some((cb) => cb.checked) && everydayCheckbox) {
          everydayCheckbox.checked = true;
        }
      });
    });

    async function triggerAutoAction(endpoint: string, button?: HTMLButtonElement) {
      const prev = button?.textContent ?? null;
      if (button) {
        button.disabled = true;
        button.textContent = "Working…";
      }
      if (feedback) feedback.textContent = "Working…";
      if (!address) {
        if (feedback) feedback.textContent = "Missing device address.";
        if (button) button.disabled = false;
        return;
      }
      try {
        await postJson(`/api/lights/${encodeURIComponent(address)}/${endpoint}`);
        if (feedback) feedback.textContent = "Command sent.";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send command.";
        if (feedback) feedback.textContent = msg;
      } finally {
        if (button) {
          button.disabled = false;
          if (prev !== null) {
            button.textContent = prev;
          }
        }
        setTimeout(() => {
          if (feedback) feedback.textContent = "";
        }, 1500);
      }
    }

    const autoEnableBtn = form.querySelector<HTMLButtonElement>(".auto-enable-btn");
    const autoManualBtn = form.querySelector<HTMLButtonElement>(".auto-manual-btn");
    const autoResetBtn = form.querySelector<HTMLButtonElement>(".auto-reset-btn");
    autoEnableBtn?.addEventListener("click", () => void triggerAutoAction("auto/enable", autoEnableBtn));
    autoManualBtn?.addEventListener("click", () => void triggerAutoAction("auto/manual", autoManualBtn));
    autoResetBtn?.addEventListener("click", () => void triggerAutoAction("auto/reset", autoResetBtn));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const sunriseHourInput = form.querySelector<HTMLInputElement>('input[name="sunriseHour"]');
      const sunriseMinuteInput = form.querySelector<HTMLInputElement>('input[name="sunriseMinute"]');
      const sunsetHourInput = form.querySelector<HTMLInputElement>('input[name="sunsetHour"]');
      const sunsetMinuteInput = form.querySelector<HTMLInputElement>('input[name="sunsetMinute"]');
      const rampInput = form.querySelector<HTMLInputElement>('input[name="ramp"]');
      if (
        !sunriseHourInput ||
        !sunriseMinuteInput ||
        !sunsetHourInput ||
        !sunsetMinuteInput ||
        !rampInput
      ) {
        if (feedback) feedback.textContent = "Missing inputs.";
        return;
      }

      const sunriseHour = Number.parseInt(sunriseHourInput.value, 10);
      const sunriseMinute = Number.parseInt(sunriseMinuteInput.value, 10);
      const sunsetHour = Number.parseInt(sunsetHourInput.value, 10);
      const sunsetMinute = Number.parseInt(sunsetMinuteInput.value, 10);
      const rampUpMinutes = Number.parseInt(rampInput.value || "0", 10);

      if (
        !Number.isFinite(sunriseHour) ||
        sunriseHour < 0 ||
        sunriseHour > 23 ||
        !Number.isFinite(sunriseMinute) ||
        sunriseMinute < 0 ||
        sunriseMinute > 59 ||
        !Number.isFinite(sunsetHour) ||
        sunsetHour < 0 ||
        sunsetHour > 23 ||
        !Number.isFinite(sunsetMinute) ||
        sunsetMinute < 0 ||
        sunsetMinute > 59
      ) {
        if (feedback) feedback.textContent = "Invalid sunrise/sunset time.";
        return;
      }

      if (!Number.isFinite(rampUpMinutes) || rampUpMinutes < 0 || rampUpMinutes > 150) {
        if (feedback) feedback.textContent = "Ramp must be 0–150 minutes.";
        return;
      }

      const channelInputs = Array.from(
        channelFields.querySelectorAll<HTMLInputElement>("input[data-channel-index]")
      );
      if (channelInputs.length === 0) {
        if (feedback) feedback.textContent = "Add at least one channel.";
        return;
      }
      if (channelInputs.length !== 1 && channelInputs.length !== 3) {
        if (feedback) feedback.textContent = "Auto settings require one or three channels.";
        return;
      }

      const brightnessValues: number[] = [];
      for (const input of channelInputs) {
        const value = Number.parseInt(input.value, 10);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          if (feedback) feedback.textContent = "Channel brightness must be 0–100.";
          input.focus();
          return;
        }
        brightnessValues.push(value);
      }

      const weekdayValues = weekdayCheckboxes
        .filter((cb) => cb.checked)
        .map((cb) => cb.value.trim().toLowerCase())
        .filter(Boolean);
      const weekdays = weekdayValues.length === 0 || weekdayValues.includes("everyday")
        ? ["everyday"]
        : weekdayValues;

      const sunrise = `${pad2(sunriseHour)}:${pad2(sunriseMinute)}`;
      const sunset = `${pad2(sunsetHour)}:${pad2(sunsetMinute)}`;
      const brightness = brightnessValues.length === 1
        ? brightnessValues[0]
        : [brightnessValues[0], brightnessValues[1], brightnessValues[2]] as [number, number, number];

      submitBtn.disabled = true;
      if (channelInput && !channelInput.hasAttribute("hidden")) {
        channelInput.disabled = true;
      }
      channelInputs.forEach((input) => {
        input.disabled = true;
      });
      if (feedback) feedback.textContent = "Sending…";

      try {
        await postJson(`/api/lights/${encodeURIComponent(address)}/auto/setting`, {
          sunrise,
          sunset,
          ramp_up_minutes: rampUpMinutes,
          weekdays,
          brightness,
        });
        if (feedback) feedback.textContent = "Auto setting added.";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to add setting.";
        if (feedback) feedback.textContent = msg;
      } finally {
        submitBtn.disabled = false;
        if (channelInput && !channelInput.hasAttribute("hidden")) {
          channelInput.disabled = false;
        }
        channelInputs.forEach((input) => {
          input.disabled = false;
        });
        setTimeout(() => {
          if (feedback) feedback.textContent = "";
        }, 2000);
      }
    });
  });
}

function setupDevSubTabs(container: HTMLElement): void {
  const tabManual = container.querySelector<HTMLButtonElement>("#dev-tab-manual");
  const tabAuto = container.querySelector<HTMLButtonElement>("#dev-tab-auto");
  const panelManual = container.querySelector<HTMLElement>("#dev-panel-manual");
  const panelAuto = container.querySelector<HTMLElement>("#dev-panel-auto");
  if (!tabManual || !tabAuto || !panelManual || !panelAuto) return;

  const setActive = (view: "manual" | "auto") => {
    const isManual = view === "manual";
    tabManual.classList.toggle("active", isManual);
    tabAuto.classList.toggle("active", !isManual);
    tabManual.setAttribute("aria-selected", isManual ? "true" : "false");
    tabAuto.setAttribute("aria-selected", !isManual ? "true" : "false");
    panelManual.toggleAttribute("hidden", !isManual);
    panelAuto.toggleAttribute("hidden", isManual);
  };

  tabManual.addEventListener("click", () => setActive("manual"));
  tabAuto.addEventListener("click", () => setActive("auto"));
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
      <button class="tab" role="tab" id="tab-dev" aria-selected="false" aria-controls="panel-dev">Dev</button>
      <div class="spacer"></div>
    </nav>

    <main>
      <section id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard">
        <div id="dashboard-content">${renderNotice("Loading dashboard…")}</div>
      </section>
      <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
        <div id="overview-content">${renderNotice("Loading overview…")}</div>
      </section>
      <section id="panel-dev" role="tabpanel" aria-labelledby="tab-dev" hidden>
        <div id="dev-content">${renderNotice("Preparing developer tools…")}</div>
      </section>
    </main>
  `;
}

function setupTabs(): void {
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
      void loadDev();
    }
  }

  tDashboard.addEventListener("click", () => setActive("dashboard"));
  tOverview.addEventListener("click", () => setActive("overview"));
  tDev.addEventListener("click", () => setActive("dev"));
}

function setupInteractions(): void {
  // No refresh buttons for now
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

async function loadDev(): Promise<void> {
  const container = document.getElementById("dev-content");
  if (!container) return;

  container.innerHTML = renderNotice("Loading developer tools…");
  try {
    const data = await fetchJson<StatusResponse>("/api/status");
    const entries = statusResponseToEntries(data).sort((a, b) =>
      a.address.localeCompare(b.address)
    );
    const lights = entries.filter((entry) => entry.status.device_type === "light");

    if (lights.length === 0) {
      container.innerHTML = renderNotice("No lights connected yet.", "info");
      return;
    }

    container.innerHTML = renderDevLightTabs(lights);
    setupManualCommandForms(container);
    setupAutoSettingForms(container);
    setupDevSubTabs(container);
  } catch (err) {
    container.innerHTML = renderNotice(
      err instanceof Error ? err.message : "Failed to load developer tools.",
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
