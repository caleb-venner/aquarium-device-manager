import { calculateLightWattage } from "./wattage-calculator";

type TestCase = {
  red: number;
  green: number;
  blue: number;
  white: number;
  expected: number;
  name: string;
};

const TEST_CASES: TestCase[] = [
  { red: 50, green: 50, blue: 50, white: 50, expected: 67, name: "50% All Channels" },
  { red: 75, green: 75, blue: 75, white: 75, expected: 100, name: "75% All Channels" },
  { red: 100, green: 100, blue: 100, white: 100, expected: 138, name: "100% All Channels" },
  { red: 100, green: 100, blue: 100, white: 0, expected: 117, name: "RGB (no White)" },
  { red: 100, green: 100, blue: 0, white: 100, expected: 118, name: "RGW (no Blue)" },
  { red: 100, green: 0, blue: 100, white: 100, expected: 87, name: "RBW (no Green)" },
  { red: 0, green: 100, blue: 100, white: 100, expected: 104, name: "GBW (no Red)" },
  { red: 136, green: 88, blue: 110, white: 55, expected: 138, name: "Mixed High (Power Limited)" },
  { red: 76, green: 127, blue: 103, white: 65, expected: 138, name: "Mixed High #2" },
  { red: 120, green: 113, blue: 121, white: 0, expected: 138, name: "RGB High (Power Limited)" },
  { red: 130, green: 88, blue: 126, white: 50, expected: 138, name: "Mixed High #3" },
  { red: 127, green: 88, blue: 136, white: 46, expected: 138, name: "Mixed High #4" },
  { red: 140, green: 0, blue: 140, white: 0, expected: 92, name: "Red + Blue 140%" },
  { red: 140, green: 0, blue: 0, white: 140, expected: 104, name: "Red + White 140%" },
  { red: 136, green: 140, blue: 0, white: 0, expected: 138, name: "Red + Green High" },
  { red: 39, green: 61, blue: 105, white: 52, expected: 82, name: "Mixed Low/Medium" },
];

function formatChannelSet(test: TestCase): string {
  return `R${test.red} / G${test.green} / B${test.blue} / W${test.white}`;
}

function classifyDelta(delta: number): "exact" | "close1" | "close2" | "close5" | "far" {
  const abs = Math.abs(delta);
  if (abs === 0) return "exact";
  if (abs <= 1) return "close1";
  if (abs <= 2) return "close2";
  if (abs <= 5) return "close5";
  return "far";
}

export function renderPercentagesTest(container: HTMLElement): void {
  container.innerHTML = `
    <div class="tool-card">
      <header class="tool-card-header">
        <h2>Percentages.txt Regression Suite</h2>
        <p class="tool-subtitle">Compare calculated wattage against the documented expectations.</p>
      </header>

      <div class="tool-actions">
        <button id="percent-run" type="button" class="btn btn-primary">Run All Tests</button>
        <button id="percent-clear" type="button" class="btn btn-secondary">Clear Results</button>
      </div>

      <section class="tool-section">
        <h3>Summary</h3>
        <div id="percent-summary" class="tool-summary" hidden></div>
      </section>

      <section class="tool-section">
        <h3>Cases</h3>
        <div id="percent-results" class="tool-results"></div>
      </section>
    </div>
  `;

  const resultsContainer = container.querySelector<HTMLDivElement>("#percent-results");
  const summaryContainer = container.querySelector<HTMLDivElement>("#percent-summary");
  const runButton = container.querySelector<HTMLButtonElement>("#percent-run");
  const clearButton = container.querySelector<HTMLButtonElement>("#percent-clear");

  if (!resultsContainer || !summaryContainer || !runButton || !clearButton) {
    return;
  }

  function runAllTests(): void {
    if (resultsContainer) {
      resultsContainer.innerHTML = "";
    }

    let exactMatches = 0;
    let within1 = 0;
    let within2 = 0;
    let within5 = 0;

    const fragment = document.createDocumentFragment();

    TEST_CASES.forEach((test) => {
      const result = calculateLightWattage(test);
      const actual = Math.round(result.totalWattage);
      const delta = actual - test.expected;
      const classification = classifyDelta(delta);

      if (classification === "exact") exactMatches += 1;
      if (classification === "close1") within1 += 1;
      if (classification === "close2") within2 += 1;
      if (classification === "close5") within5 += 1;

      const caseDiv = document.createElement("div");
      caseDiv.className = `tool-result ${classification}`;
      caseDiv.innerHTML = `
        <div class="tool-result-heading">
          <h4>${test.name}</h4>
          <span>${formatChannelSet(test)}</span>
        </div>
        <dl class="tool-result-stats">
          <div>
            <dt>Expected</dt>
            <dd>${test.expected} W</dd>
          </div>
          <div>
            <dt>Actual</dt>
            <dd>${actual} W</dd>
          </div>
          <div>
            <dt>Delta</dt>
            <dd>${delta >= 0 ? "+" : ""}${delta} W</dd>
          </div>
        </dl>
      `;
      fragment.appendChild(caseDiv);
    });

    if (resultsContainer) {
      resultsContainer.appendChild(fragment);
    }

    if (summaryContainer) {
      summaryContainer.hidden = false;
      summaryContainer.innerHTML = `
        <ul class="tool-summary-list">
          <li><strong>${exactMatches}</strong> exact matches</li>
          <li><strong>${within1}</strong> within 1W</li>
          <li><strong>${within2}</strong> within 2W</li>
          <li><strong>${within5}</strong> within 5W</li>
        </ul>
      `;
    }
  }

  function clearResults(): void {
    if (resultsContainer) {
      resultsContainer.innerHTML = "";
    }
    if (summaryContainer) {
      summaryContainer.hidden = true;
    }
  }

  runButton.addEventListener("click", runAllTests);
  clearButton.addEventListener("click", clearResults);
}
