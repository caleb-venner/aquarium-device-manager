/**
 * Wattage calculator component
 */

import { calculateLightWattage, formatWattage, getMaxWattage, getTheoreticalMaxWattage, type ChannelPercentages, type WattageCalculationResult } from "../../../utils/wattage-calculator";

/**
 * Render LED wattage calculator for testing light configurations
 */
export function renderWattageCalculator(): string {
  return `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <!-- Calculator Input -->
      <div>
        <h3 style="margin: 0 0 16px 0; color: var(--gray-900);">Channel Intensity</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 16px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">Red (%)</label>
            <input type="number"
                   id="watt-red"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">Green (%)</label>
            <input type="number"
                   id="watt-green"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">Blue (%)</label>
            <input type="number"
                   id="watt-blue"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600; color: var(--gray-700);">White (%)</label>
            <input type="number"
                   id="watt-white"
                   min="0" max="140"
                   value="75"
                   step="1"
                   onchange="window.calculateWattageFromInputs()"
                   style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px;">
          </div>
        </div>
      </div>

      <!-- Results -->
      <div id="wattage-results" style="
        background: var(--gray-50);
        border: 1px solid var(--gray-200);
        border-radius: 8px;
        padding: 20px;
      ">
        <!-- Results will be populated by calculateWattageFromInputs() -->
      </div>

      <!-- Test Cases -->
      <div>
        <h3 style="margin: 0 0 16px 0; color: var(--gray-900);">Test Cases</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
          <button onclick="window.setWattageTestCase(0, 0, 0, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Off</strong><br>
            R:0% G:0% B:0% W:0%
          </button>
          <button onclick="window.setWattageTestCase(50, 50, 50, 50)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>50% All</strong><br>
            R:50% G:50% B:50% W:50%
          </button>
          <button onclick="window.setWattageTestCase(100, 100, 100, 100)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>100% All</strong><br>
            R:100% G:100% B:100% W:100%
          </button>
          <button onclick="window.setWattageTestCase(139, 139, 137, 140)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Maximum</strong><br>
            R:139% G:139% B:137% W:140%
          </button>
          <button onclick="window.setWattageTestCase(100, 0, 0, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Red Only</strong><br>
            R:100% G:0% B:0% W:0%
          </button>
          <button onclick="window.setWattageTestCase(0, 100, 0, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Green Only</strong><br>
            R:0% G:100% B:0% W:0%
          </button>
          <button onclick="window.setWattageTestCase(0, 0, 100, 0)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>Blue Only</strong><br>
            R:0% G:0% B:100% W:0%
          </button>
          <button onclick="window.setWattageTestCase(0, 0, 0, 100)"
                  style="padding: 12px; border: 1px solid var(--gray-300); border-radius: 6px; background: white; cursor: pointer;">
            <strong>White Only</strong><br>
            R:0% G:0% B:0% W:100%
          </button>
        </div>
      </div>

      <!-- Device Specifications -->
      <div style="
        background: var(--blue-50);
        border: 1px solid var(--blue-200);
        border-radius: 8px;
        padding: 16px;
      ">
        <h4 style="margin: 0 0 8px 0; color: var(--blue-900);">Device Specifications</h4>
        <p style="margin: 4px 0; color: var(--blue-800);"><strong>Actual Maximum Wattage:</strong> ${formatWattage(getMaxWattage())} (power supply limited)</p>
        <p style="margin: 4px 0; color: var(--blue-800);"><strong>Theoretical Maximum:</strong> ${formatWattage(getTheoreticalMaxWattage())} (if no power limiting)</p>
        <p style="margin: 4px 0; color: var(--blue-800);"><strong>Model:</strong> WRGB Pro II</p>
        <p style="margin: 4px 0 0 0; color: var(--blue-800);"><strong>Power Limiting:</strong> Channels scaled down proportionally when total exceeds 138W</p>
      </div>
    </div>
  `;
}

/**
 * Calculate and display wattage results from input fields
 */
export function calculateWattageFromInputs(): void {
  const redInput = document.getElementById('watt-red') as HTMLInputElement;
  const greenInput = document.getElementById('watt-green') as HTMLInputElement;
  const blueInput = document.getElementById('watt-blue') as HTMLInputElement;
  const whiteInput = document.getElementById('watt-white') as HTMLInputElement;
  const resultsDiv = document.getElementById('wattage-results');

  if (!redInput || !greenInput || !blueInput || !whiteInput || !resultsDiv) {
    return;
  }

  const red = parseInt(redInput.value) || 0;
  const green = parseInt(greenInput.value) || 0;
  const blue = parseInt(blueInput.value) || 0;
  const white = parseInt(whiteInput.value) || 0;

  const result = calculateLightWattage({ red, green, blue, white });
  displayWattageResults(result);
}

/**
 * Set test case values and calculate wattage
 */
export function setWattageTestCase(red: number, green: number, blue: number, white: number): void {
  const redInput = document.getElementById('watt-red') as HTMLInputElement;
  const greenInput = document.getElementById('watt-green') as HTMLInputElement;
  const blueInput = document.getElementById('watt-blue') as HTMLInputElement;
  const whiteInput = document.getElementById('watt-white') as HTMLInputElement;

  if (redInput) redInput.value = red.toString();
  if (greenInput) greenInput.value = green.toString();
  if (blueInput) blueInput.value = blue.toString();
  if (whiteInput) whiteInput.value = white.toString();

  const result = calculateLightWattage({ red, green, blue, white });
  displayWattageResults(result);
}

/**
 * Display wattage calculation results
 */
function displayWattageResults(result: WattageCalculationResult): void {
  const resultsDiv = document.getElementById('wattage-results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <!-- Total Wattage -->
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 36px; font-weight: bold; color: var(--primary); margin-bottom: 8px;">${formatWattage(result.totalWattage)}</div>
      <div style="color: var(--gray-600);">Total Power Consumption</div>
      ${result.powerLimited ? '<div style="color: var(--warning); font-size: 14px; margin-top: 4px;">⚠️ Power limited from ${formatWattage(result.requestedWattage)}</div>' : ''}
    </div>

    <!-- Channel Breakdown -->
    <div style="margin-bottom: 20px;">
      <h4 style="margin: 0 0 12px 0; color: var(--gray-900);">Channel Power Distribution</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
        <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
          <div style="color: #ef4444; font-weight: bold; margin-bottom: 4px;">Red</div>
          <div>${formatWattage(result.channelWattages.red)}</div>
        </div>
        <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
          <div style="color: #22c55e; font-weight: bold; margin-bottom: 4px;">Green</div>
          <div>${formatWattage(result.channelWattages.green)}</div>
        </div>
        <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
          <div style="color: #3b82f6; font-weight: bold; margin-bottom: 4px;">Blue</div>
          <div>${formatWattage(result.channelWattages.blue)}</div>
        </div>
        <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
          <div style="color: #64748b; font-weight: bold; margin-bottom: 4px;">White</div>
          <div>${formatWattage(result.channelWattages.white)}</div>
        </div>
      </div>
    </div>

    <!-- Technical Details -->
    <div>
      <h4 style="margin: 0 0 12px 0; color: var(--gray-900);">Technical Details</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
        <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
          <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Step Sum</div>
          <div style="font-weight: bold; color: var(--gray-900);">${result.stepSum}W</div>
        </div>
        <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
          <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Embedded Base</div>
          <div style="font-weight: bold; color: var(--gray-900);">${result.embeddedBaseSum}W</div>
        </div>
        <div style="text-align: center; padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: 6px;">
          <div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Shared Base</div>
          <div style="font-weight: bold; color: var(--gray-900);">${result.sharedBase}W</div>
        </div>
      </div>
    </div>
  `;
}
