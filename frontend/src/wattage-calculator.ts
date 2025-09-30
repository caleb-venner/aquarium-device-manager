import { WRGB_PRO_II_WATTAGE_DATA, ChannelWattageData } from './wattage-data';

export interface ChannelPercentages {
  red: number;
  green: number;
  blue: number;
  white: number;
}

export interface WattageCalculationResult {
  totalWattage: number;
  channelWattages: {
    red: number;
    green: number;
    blue: number;
    white: number;
  };
  stepSum: number;
  embeddedBaseSum: number;
  sharedBase: number;
  requestedWattage: number; // What the channels would use without power limiting
  powerLimited: boolean; // Whether power limiting was applied
  efficiency: number; // percentage of rated power being used
}

// Embedded base values for each channel (constants)
const EMBEDDED_BASE_VALUES = {
  Red: 9,
  Green: 10,
  Blue: 9,
  White: 9
};

/**
 * Converts a percentage string (e.g., "75%") to a number (e.g., 75)
 */
function parsePercentage(percentageStr: string): number {
  return parseInt(percentageStr.replace('%', ''), 10);
}

/**
 * Calculates the step wattage for a single channel based on its percentage
 * Uses floor lookup: finds the largest percentage in step table ≤ input percentage
 */
function calculateChannelStepWattage(percentage: number, channelData: ChannelWattageData): number {
  if (percentage < 1) return 0; // Channel is OFF

  // Convert percentage strings to numbers for comparison
  const thresholds = channelData.Percentage.map(parsePercentage);
  const wattages = channelData.Wattage;

  // Find the largest percentage ≤ input percentage (floor lookup)
  let selectedWattage = wattages[0]; // Default to first entry
  for (let i = 0; i < thresholds.length && i < wattages.length; i++) {
    if (percentage >= thresholds[i]) {
      selectedWattage = wattages[i];
    } else {
      break; // We've exceeded the input percentage
    }
  }

  return selectedWattage;
}

/**
 * Determines shared base value based on which channels are ON
 */
function calculateSharedBase(redOn: boolean, greenOn: boolean, blueOn: boolean, whiteOn: boolean): number {
  const numOn = (redOn ? 1 : 0) + (greenOn ? 1 : 0) + (blueOn ? 1 : 0) + (whiteOn ? 1 : 0);

  if (numOn === 0) {
    return 0;
  } else if (greenOn && numOn <= 2) {
    return 10;
  } else if (greenOn && numOn <= 3) {
    return 9;
  } else if ( numOn === 4) {
    return 10;
  } else {
    return 9;
  }
}

/**
 * Calculates efficiency for 3-channel cases based on which channels are active
 * Different channel combinations have different efficiency characteristics
 * The step data is the true source - efficiency accounts for device power management
 */
/* function calculateThreeChannelEfficiency(rawPowerSum: number, channels: ChannelPercentages): number {
  const hasHighGreen = channels.green >= 140; // Green at 140% creates high efficiency
  const hasHighBlue = channels.blue >= 140;   // Blue at 140% creates lower efficiency

  if (hasHighGreen && !hasHighBlue) {
    // High Green scenarios: step data gives 227W, device shows 129W
    // Efficiency = 129W / 227W = 56.8%
    return 0.568;
  } else if (hasHighBlue && !hasHighGreen) {
    // High Blue scenarios: step data gives 210W, device shows 81W
    // Efficiency = 81W / 210W = 38.6%
    return 0.386;
  } else {
    // Default 3-channel efficiency for balanced scenarios
    return 0.783; // Previous calibrated value for balanced 3-channel cases
  }
} */

/**
 * Calculates the total wattage output for WRGB Pro II based on channel percentages
 * Implements true device power calculation with embedded base + shared base algorithm
 * Also applies 138W power limiting - if requested power exceeds this, channels are scaled down proportionally
 * @param channels - Object containing percentage values (0-140) for each channel
 * @returns Detailed wattage calculation results with power limiting applied
 */
export function calculateLightWattage(channels: ChannelPercentages): WattageCalculationResult {
  // Determine which channels are on (>= 1%)
  const redOn = channels.red >= 1;
  const greenOn = channels.green >= 1;
  const blueOn = channels.blue >= 1;
  const whiteOn = channels.white >= 1;

  // Get raw step wattages from lookup tables
  const rawStepWattages = {
    red: redOn ? calculateChannelStepWattage(channels.red, WRGB_PRO_II_WATTAGE_DATA.Red) : 0,
    green: greenOn ? calculateChannelStepWattage(channels.green, WRGB_PRO_II_WATTAGE_DATA.Green) : 0,
    blue: blueOn ? calculateChannelStepWattage(channels.blue, WRGB_PRO_II_WATTAGE_DATA.Blue) : 0,
    white: whiteOn ? calculateChannelStepWattage(channels.white, WRGB_PRO_II_WATTAGE_DATA.White) : 0
  };

  // Calculate step values (subtract embedded base from each active channel)
  const stepValues = {
    red: redOn ? rawStepWattages.red - EMBEDDED_BASE_VALUES.Red : 0,
    green: greenOn ? rawStepWattages.green - EMBEDDED_BASE_VALUES.Green : 0,
    blue: blueOn ? rawStepWattages.blue - EMBEDDED_BASE_VALUES.Blue : 0,
    white: whiteOn ? rawStepWattages.white - EMBEDDED_BASE_VALUES.White : 0
  };

  // Sum all step values
  const stepSum = stepValues.red + stepValues.green + stepValues.blue + stepValues.white;

  // Calculate embedded base sum (only for active channels)
  let embeddedBaseSum = 0;
  if (redOn) embeddedBaseSum += EMBEDDED_BASE_VALUES.Red;
  if (greenOn) embeddedBaseSum += EMBEDDED_BASE_VALUES.Green;
  if (blueOn) embeddedBaseSum += EMBEDDED_BASE_VALUES.Blue;
  if (whiteOn) embeddedBaseSum += EMBEDDED_BASE_VALUES.White;

  // Calculate shared base
  const sharedBase = calculateSharedBase(redOn, greenOn, blueOn, whiteOn);

  // Final device power = step sum + shared base
  const deviceDraw = stepSum + sharedBase;

  // For backward compatibility, also calculate individual channel contributions
  // These represent the "apparent" wattage each channel contributes to the total
  const totalStepWattage = rawStepWattages.red + rawStepWattages.green +
                          rawStepWattages.blue + rawStepWattages.white;

  // Calculate proportional channel contributions based on step wattages
  const channelWattages = {
    red: totalStepWattage > 0 ? Math.round((rawStepWattages.red / totalStepWattage) * deviceDraw) : 0,
    green: totalStepWattage > 0 ? Math.round((rawStepWattages.green / totalStepWattage) * deviceDraw) : 0,
    blue: totalStepWattage > 0 ? Math.round((rawStepWattages.blue / totalStepWattage) * deviceDraw) : 0,
    white: totalStepWattage > 0 ? Math.round((rawStepWattages.white / totalStepWattage) * deviceDraw) : 0
  };

  const requestedWattage = deviceDraw;

  // Apply 138W power limiting
  const MAX_TOTAL_WATTAGE = 138;
  let finalChannelWattages = { ...channelWattages };
  let totalWattage = requestedWattage;
  let powerLimited = false;

  if (requestedWattage > MAX_TOTAL_WATTAGE) {
    // Scale down all channels proportionally to stay within power limit
    const scaleFactor = MAX_TOTAL_WATTAGE / requestedWattage;
    finalChannelWattages = {
      red: Math.round(channelWattages.red * scaleFactor),
      green: Math.round(channelWattages.green * scaleFactor),
      blue: Math.round(channelWattages.blue * scaleFactor),
      white: Math.round(channelWattages.white * scaleFactor)
    };
    totalWattage = finalChannelWattages.red + finalChannelWattages.green + finalChannelWattages.blue + finalChannelWattages.white;
    powerLimited = true;
  }

  // Calculate efficiency based on actual device maximum (138W)
  const efficiency = Math.round((totalWattage / MAX_TOTAL_WATTAGE) * 100);

  return {
    totalWattage,
    channelWattages: finalChannelWattages,
    stepSum,
    embeddedBaseSum,
    sharedBase,
    requestedWattage,
    powerLimited,
    efficiency
  };
}

/**
 * Gets the maximum possible wattage for WRGB Pro II (actual device limit)
 */
export function getMaxWattage(): number {
  return 138; // Actual device power limit
}

/**
 * Gets the theoretical maximum wattage if all channels could run at max simultaneously
 */
export function getTheoreticalMaxWattage(): number {
  const maxWattages = {
    red: WRGB_PRO_II_WATTAGE_DATA.Red.Wattage[WRGB_PRO_II_WATTAGE_DATA.Red.Wattage.length - 1],
    green: WRGB_PRO_II_WATTAGE_DATA.Green.Wattage[WRGB_PRO_II_WATTAGE_DATA.Green.Wattage.length - 1],
    blue: WRGB_PRO_II_WATTAGE_DATA.Blue.Wattage[WRGB_PRO_II_WATTAGE_DATA.Blue.Wattage.length - 1],
    white: WRGB_PRO_II_WATTAGE_DATA.White.Wattage[WRGB_PRO_II_WATTAGE_DATA.White.Wattage.length - 1]
  };

  return maxWattages.red + maxWattages.green + maxWattages.blue + maxWattages.white;
}

/**
 * Formats wattage for display
 */
export function formatWattage(wattage: number): string {
  return `${wattage}W`;
}

/**
 * Example usage and testing function
 */
export function testWattageCalculation(): void {
  console.log('=== WRGB Pro II Wattage Calculator Test ===');
  console.log('Device power limit: 138W');
  console.log('Theoretical max (if no limiting): ' + getTheoreticalMaxWattage() + 'W');
  console.log('');

  // Test case 1: Normal operation - no power limiting
  const test1 = calculateLightWattage({ red: 50, green: 50, blue: 50, white: 50 });
  console.log('50% all channels:', test1);

  // Test case 2: At 100% - likely no power limiting
  const test2 = calculateLightWattage({ red: 100, green: 100, blue: 100, white: 100 });
  console.log('100% all channels:', test2);

  // Test case 3: Mixed percentages
  const test3 = calculateLightWattage({ red: 75, green: 60, blue: 40, white: 80 });
  console.log('Mixed percentages:', test3);

  // Test case 4: Maximum possible - should trigger power limiting
  const test4 = calculateLightWattage({ red: 139, green: 139, blue: 137, white: 140 });
  console.log('Maximum possible (power limited):', test4);

  // Test case 5: High values that should trigger limiting
  const test5 = calculateLightWattage({ red: 120, green: 120, blue: 120, white: 120 });
  console.log('120% all channels (power limited):', test5);
}
