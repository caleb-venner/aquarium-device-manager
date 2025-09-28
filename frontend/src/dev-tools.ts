// Developer tools for manual and auto device control

import type { DeviceEntry, LightChannel, ManualBrightnessPayload, StatusResponse } from "./types";
import { statusResponseToEntries } from "./types";
import { escapeHtml, pad2, renderNotice } from "./utils";
import { postJson, sendManualBrightnessCommands, fetchJson } from "./api";

export async function loadDevTools(): Promise<void> {
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

  return `
    <div class="debug-section">
      <div class="debug-section__header">
        <h3>Manual Control — ${escapeHtml(modelName)}</h3>
        ${connectedBadge}
      </div>
      <form class="manual-command-form" data-address="${escapeHtml(address)}"${datasetAttr}>
        ${channelCountControl}
        <div data-role="channel-fields" class="channel-fields"></div>
        <button type="submit" class="btn">Send Command</button>
        <p class="form-feedback"></p>
      </form>
    </div>
  `;
}

function renderDevManualSection(entries: DeviceEntry[]): string {
  return entries.map(renderDevManualCard).join("");
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

  return `
    <div class="debug-section">
      <div class="debug-section__header">
        <h3>Auto Settings — ${escapeHtml(modelName)}</h3>
        ${connectedBadge}
      </div>
      <form class="auto-setting-form" data-address="${escapeHtml(address)}"${datasetAttr}>
        <div class="form-row">
          <div class="form-field">
            <label>
              <span>Sunrise</span>
              <div class="time-input">
                <input type="number" name="sunriseHour" min="0" max="23" value="8" required />
                <span>:</span>
                <input type="number" name="sunriseMinute" min="0" max="59" value="0" required />
              </div>
            </label>
          </div>
          <div class="form-field">
            <label>
              <span>Sunset</span>
              <div class="time-input">
                <input type="number" name="sunsetHour" min="0" max="23" value="20" required />
                <span>:</span>
                <input type="number" name="sunsetMinute" min="0" max="59" value="0" required />
              </div>
            </label>
          </div>
          <div class="form-field">
            <label>
              <span>Ramp (min)</span>
              <input type="number" name="ramp" min="0" max="120" value="30" required />
            </label>
          </div>
        </div>
        ${channelCountControl}
        <div data-role="auto-channel-fields" class="channel-fields"></div>
        <div class="form-field">
          <label><span>Days</span></label>
          <div class="weekday-checkboxes">
            <label><input type="checkbox" name="weekday" value="everyday" checked /> Everyday</label>
            <label><input type="checkbox" name="weekday" value="monday" /> Mon</label>
            <label><input type="checkbox" name="weekday" value="tuesday" /> Tue</label>
            <label><input type="checkbox" name="weekday" value="wednesday" /> Wed</label>
            <label><input type="checkbox" name="weekday" value="thursday" /> Thu</label>
            <label><input type="checkbox" name="weekday" value="friday" /> Fri</label>
            <label><input type="checkbox" name="weekday" value="saturday" /> Sat</label>
            <label><input type="checkbox" name="weekday" value="sunday" /> Sun</label>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">Add Setting</button>
          <button type="button" class="btn auto-enable-btn">Enable Auto</button>
          <button type="button" class="btn auto-manual-btn">Manual Mode</button>
          <button type="button" class="btn auto-reset-btn">Reset Settings</button>
        </div>
        <p class="form-feedback"></p>
      </form>
    </div>
  `;
}

function renderDevAutoSection(entries: DeviceEntry[]): string {
  return entries.map(renderDevAutoCard).join("");
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

    function clampChannelCount(value: number): number {
      if (!Number.isFinite(value) || value < 1) return 1;
      if (value > 6) return 6;
      return Math.round(value);
    }

    function buildFromChannels(channels: LightChannel[]): void {
      if (!channelFields) return;
      channelFields.innerHTML = channels
        .map((channel) => {
          return `
            <div class="form-field">
              <label>
                <span>${escapeHtml(channel.name)} (${channel.index})</span>
                <input type="number" name="brightness" min="0" max="100" value="50" data-channel-index="${channel.index}" required />
              </label>
            </div>
          `;
        })
        .join("");
    }

    function buildFromCount(count: number): void {
      if (!channelFields) return;
      const inputs = Array.from({ length: count }, (_, idx) => {
        return `
          <div class="form-field">
            <label>
              <span>Channel ${idx + 1}</span>
              <input type="number" name="brightness" min="0" max="100" value="50" data-channel-index="${idx}" required />
            </label>
          </div>
        `;
      });
      channelFields.innerHTML = inputs.join("");
    }

    if (parsedChannels.length > 0) {
      buildFromChannels(parsedChannels);
      if (channelInput) {
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
      if (feedback) feedback.textContent = "Sending command…";

      try {
        await sendManualBrightnessCommands(address, payloads);
        if (feedback) feedback.textContent = "Command sent successfully.";
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
        setTimeout(() => {
          if (feedback) feedback.textContent = "";
        }, 2000);
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
          .sort((a, b) => a.index - b.index);
      } catch {
        return [];
      }
    })();

    function clampChannelCount(value: number): number {
      if (!Number.isFinite(value) || value < 1) return 1;
      if (value > 6) return 6;
      return Math.round(value);
    }

    function buildFromChannels(channels: LightChannel[]): void {
      if (!channelFields) return;
      channelFields.innerHTML = channels
        .map((channel) => {
          return `
            <div class="form-field">
              <label>
                <span>${escapeHtml(channel.name)} Max Brightness (${channel.index})</span>
                <input type="number" name="autoBrightness" min="0" max="100" value="75" data-channel-index="${channel.index}" required />
              </label>
            </div>
          `;
        })
        .join("");
    }

    function buildFromCount(count: number): void {
      if (!channelFields) return;
      const inputs = Array.from({ length: count }, (_, idx) => {
        return `
          <div class="form-field">
            <label>
              <span>Channel ${idx + 1} Max Brightness</span>
              <input type="number" name="autoBrightness" min="0" max="100" value="75" data-channel-index="${idx}" required />
            </label>
          </div>
        `;
      });
      channelFields.innerHTML = inputs.join("");
    }

    if (parsedChannels.length > 0) {
      buildFromChannels(parsedChannels);
      if (channelInput) {
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
      form.querySelectorAll<HTMLInputElement>('input[name="weekday"]')
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
        await postJson(`/api/lights/${encodeURIComponent(address)}/${endpoint}`, {});
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
        return;
      }

      const sunriseHour = Number.parseInt(sunriseHourInput.value, 10);
      const sunriseMinute = Number.parseInt(sunriseMinuteInput.value, 10);
      const sunsetHour = Number.parseInt(sunsetHourInput.value, 10);
      const sunsetMinute = Number.parseInt(sunsetMinuteInput.value, 10);
      const rampMinutes = Number.parseInt(rampInput.value, 10);

      if (
        !Number.isFinite(sunriseHour) || sunriseHour < 0 || sunriseHour > 23 ||
        !Number.isFinite(sunriseMinute) || sunriseMinute < 0 || sunriseMinute > 59 ||
        !Number.isFinite(sunsetHour) || sunsetHour < 0 || sunsetHour > 23 ||
        !Number.isFinite(sunsetMinute) || sunsetMinute < 0 || sunsetMinute > 59 ||
        !Number.isFinite(rampMinutes) || rampMinutes < 0
      ) {
        if (feedback) feedback.textContent = "Invalid time or ramp values.";
        return;
      }

      const brightnessInputs = Array.from(
        channelFields.querySelectorAll<HTMLInputElement>("input[data-channel-index]")
      );
      const brightnessValues: number[] = [];
      for (const input of brightnessInputs) {
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
      brightnessInputs.forEach((input) => {
        input.disabled = true;
      });
      if (feedback) feedback.textContent = "Adding auto setting…";

      try {
        await postJson(`/api/lights/${encodeURIComponent(address)}/auto/settings`, {
          sunrise,
          sunset,
          brightness,
          ramp_up_minutes: rampMinutes,
          weekdays,
        });
        if (feedback) feedback.textContent = "Auto setting added successfully.";
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add auto setting.";
        if (feedback) feedback.textContent = message;
      } finally {
        submitBtn.disabled = false;
        if (channelInput && !channelInput.hasAttribute("hidden")) {
          channelInput.disabled = false;
        }
        brightnessInputs.forEach((input) => {
          input.disabled = false;
        });
        setTimeout(() => {
          if (feedback) feedback.textContent = "";
        }, 2000);
      }
    });
  });
}

export function setupDevSubTabs(container: HTMLElement): void {
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
