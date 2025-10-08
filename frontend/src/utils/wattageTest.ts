import {
  calculateLightWattage,
  getMaxWattage,
  getTheoreticalMaxWattage,
  formatWattage,
} from "./wattage-calculator";

type ChannelValues = {
  red: number;
  green: number;
  blue: number;
  white: number;
};

type TestCase = ChannelValues & {
  name: string;
};

const TEST_CASES: TestCase[] = [
  { red: 50, green: 50, blue: 50, white: 50, name: "50% All Channels" },
  { red: 75, green: 75, blue: 75, white: 75, name: "75% All Channels" },
  { red: 100, green: 100, blue: 100, white: 100, name: "100% All Channels" },
  { red: 140, green: 0, blue: 140, white: 0, name: "Red & Blue 140%" },
  { red: 136, green: 88, blue: 110, white: 55, name: "Mixed High (Power Limited)" },
];

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(140, Math.round(value)));
}

function createInput(id: string, label: string, value: number): string {
  return `
    <label class="tool-field">
      <span>${label} (%)</span>
      <input id="${id}" type="number" min="0" max="140" step="1" value="${value}">
    </label>
  `;
}

function renderTestCaseButtons(): string {
  return TEST_CASES.map((test, index) => {
    return `
      <button
        class="tool-chip"
        data-index="${index}"
        type="button"
      >${test.name}</button>
    `;
  }).join("");
}

export function renderWattageTest(container: HTMLElement): void {
  container.innerHTML = `
    <div class="tool-card">
      <header class="tool-card-header">
        <h2>WRGB Pro II Wattage Calculator</h2>
        <p class="tool-subtitle">Visualise output and power limiting behaviour.</p>
      </header>
      <div class="tool-grid">
        <section class="tool-section">
          <h3>Channel Inputs</h3>
          <div class="tool-field-grid">
            ${createInput("watt-red", "Red", 75)}
            ${createInput("watt-green", "Green", 75)}
            ${createInput("watt-blue", "Blue", 75)}
            ${createInput("watt-white", "White", 75)}
          </div>
          <div class="tool-actions">
            <button id="watt-run" type="button" class="btn btn-primary">Calculate Wattage</button>
          </div>
          <div class="tool-chips" id="watt-cases">
            ${renderTestCaseButtons()}
          </div>
        </section>

        <section class="tool-section">
          <h3>Results</h3>
          <dl class="tool-stats">
            <div>
              <dt>Total Wattage</dt>
              <dd id="watt-total">—</dd>
            </div>
            <div>
              <dt>Power Limiting</dt>
              <dd id="watt-limiting">—</dd>
            </div>
          </dl>
          <div class="tool-breakdown">
            <div>
              <span class="label">Step Sum</span>
              <span id="watt-step">—</span>
            </div>
            <div>
              <span class="label">Embedded Base</span>
              <span id="watt-embedded">—</span>
            </div>
            <div>
              <span class="label">Shared Base</span>
              <span id="watt-shared">—</span>
            </div>
          </div>
          <div class="tool-breakdown tool-breakdown-grid">
            <div>
              <span class="label">Red</span>
              <span id="watt-red-out">—</span>
            </div>
            <div>
              <span class="label">Green</span>
              <span id="watt-green-out">—</span>
            </div>
            <div>
              <span class="label">Blue</span>
              <span id="watt-blue-out">—</span>
            </div>
            <div>
              <span class="label">White</span>
              <span id="watt-white-out">—</span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div class="tool-card">
      <header class="tool-card-header">
        <h3>Device Specification</h3>
      </header>
      <dl class="tool-stats">
        <div>
          <dt>Power Supply Limit</dt>
          <dd>${formatWattage(getMaxWattage())}</dd>
        </div>
        <div>
          <dt>Theoretical Maximum</dt>
          <dd>${formatWattage(getTheoreticalMaxWattage())}</dd>
        </div>
        <div>
          <dt>Behaviour</dt>
          <dd>Channels scale proportionally when combined load exceeds PSU limit.</dd>
        </div>
      </dl>
    </div>
  `;

  const redInput = container.querySelector<HTMLInputElement>("#watt-red");
  const greenInput = container.querySelector<HTMLInputElement>("#watt-green");
  const blueInput = container.querySelector<HTMLInputElement>("#watt-blue");
  const whiteInput = container.querySelector<HTMLInputElement>("#watt-white");
  const runButton = container.querySelector<HTMLButtonElement>("#watt-run");
  const caseContainer = container.querySelector<HTMLDivElement>("#watt-cases");

  if (!redInput || !greenInput || !blueInput || !whiteInput || !runButton) {
    return;
  }

  const totalEl = container.querySelector<HTMLDListElement>("#watt-total");
  const limitingEl = container.querySelector<HTMLSpanElement>("#watt-limiting");
  const stepEl = container.querySelector<HTMLSpanElement>("#watt-step");
  const embeddedEl = container.querySelector<HTMLSpanElement>("#watt-embedded");
  const sharedEl = container.querySelector<HTMLSpanElement>("#watt-shared");
  const channelOutputs = {
    red: container.querySelector<HTMLSpanElement>("#watt-red-out"),
    green: container.querySelector<HTMLSpanElement>("#watt-green-out"),
    blue: container.querySelector<HTMLSpanElement>("#watt-blue-out"),
    white: container.querySelector<HTMLSpanElement>("#watt-white-out"),
  } as const;

  function readValues(): ChannelValues {
    return {
      red: clampPercent(Number(redInput.value)),
      green: clampPercent(Number(greenInput.value)),
      blue: clampPercent(Number(blueInput.value)),
      white: clampPercent(Number(whiteInput.value)),
    };
  }

  function writeValues(values: ChannelValues): void {
    redInput.value = String(values.red);
    greenInput.value = String(values.green);
    blueInput.value = String(values.blue);
    whiteInput.value = String(values.white);
  }

  function updateOutputs(): void {
    const values = readValues();
    try {
      const result = calculateLightWattage(values);
      if (totalEl) totalEl.textContent = formatWattage(result.totalWattage);
      if (limitingEl) {
        limitingEl.textContent = result.powerLimited
          ? `⚠️ Limited to ${formatWattage(result.totalWattage)} (requested ${formatWattage(result.requestedWattage)})`
          : "No power limiting";
      }
      if (stepEl) stepEl.textContent = formatWattage(result.stepSum);
      if (embeddedEl) embeddedEl.textContent = formatWattage(result.embeddedBaseSum);
      if (sharedEl) sharedEl.textContent = formatWattage(result.sharedBase);
      channelOutputs.red!.textContent = formatWattage(result.channelWattages.red);
      channelOutputs.green!.textContent = formatWattage(result.channelWattages.green);
      channelOutputs.blue!.textContent = formatWattage(result.channelWattages.blue);
      channelOutputs.white!.textContent = formatWattage(result.channelWattages.white);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (totalEl) totalEl.textContent = `Error: ${message}`;
    }
  }

  [redInput, greenInput, blueInput, whiteInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.value = String(clampPercent(Number(input.value)));
      updateOutputs();
    });
  });

  runButton.addEventListener("click", updateOutputs);

  if (caseContainer) {
    caseContainer.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".tool-chip");
      if (!target) return;
      const index = Number(target.dataset.index ?? "NaN");
      const test = TEST_CASES[index];
      if (!test) return;
      writeValues(test);
      updateOutputs();
    });
  }

  updateOutputs();
}
