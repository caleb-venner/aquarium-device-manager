import { WRGB_PRO_II_WATTAGE_DATA } from './wattage-data';
/**
 * Converts a percentage string (e.g., "75%") to a number (e.g., 75)
 */
function parsePercentage(percentageStr) {
    return parseInt(percentageStr.replace('%', ''), 10);
}
/**
 * Calculates the wattage for a single channel based on its percentage
 * Uses step-wise mapping where each percentage threshold corresponds to a wattage
 */
function calculateChannelWattage(percentage, channelData) {
    if (percentage <= 0)
        return 0;
    // Convert percentage strings to numbers for comparison
    const thresholds = channelData.Percentage.map(parsePercentage);
    const wattages = channelData.Wattage;
    // Find the appropriate wattage step
    for (let i = 0; i < thresholds.length; i++) {
        if (percentage <= thresholds[i]) {
            return wattages[i];
        }
    }
    // If percentage exceeds all thresholds, return the maximum wattage
    return wattages[wattages.length - 1];
}
/**
 * Calculates the total wattage output for WRGB Pro II based on channel percentages
 * @param channels - Object containing percentage values (0-100+) for each channel
 * @returns Detailed wattage calculation results
 */
export function calculateLightWattage(channels) {
    const channelWattages = {
        red: calculateChannelWattage(channels.red, WRGB_PRO_II_WATTAGE_DATA.Red),
        green: calculateChannelWattage(channels.green, WRGB_PRO_II_WATTAGE_DATA.Green),
        blue: calculateChannelWattage(channels.blue, WRGB_PRO_II_WATTAGE_DATA.Blue),
        white: calculateChannelWattage(channels.white, WRGB_PRO_II_WATTAGE_DATA.White)
    };
    const totalWattage = channelWattages.red + channelWattages.green + channelWattages.blue + channelWattages.white;
    // Calculate efficiency based on maximum possible wattage
    // Maximum wattage is the sum of each channel's maximum wattage
    const maxWattages = {
        red: WRGB_PRO_II_WATTAGE_DATA.Red.Wattage[WRGB_PRO_II_WATTAGE_DATA.Red.Wattage.length - 1],
        green: WRGB_PRO_II_WATTAGE_DATA.Green.Wattage[WRGB_PRO_II_WATTAGE_DATA.Green.Wattage.length - 1],
        blue: WRGB_PRO_II_WATTAGE_DATA.Blue.Wattage[WRGB_PRO_II_WATTAGE_DATA.Blue.Wattage.length - 1],
        white: WRGB_PRO_II_WATTAGE_DATA.White.Wattage[WRGB_PRO_II_WATTAGE_DATA.White.Wattage.length - 1]
    };
    const maxTotalWattage = maxWattages.red + maxWattages.green + maxWattages.blue + maxWattages.white;
    const efficiency = Math.round((totalWattage / maxTotalWattage) * 100);
    return {
        totalWattage,
        channelWattages,
        efficiency
    };
}
/**
 * Gets the maximum possible wattage for WRGB Pro II
 */
export function getMaxWattage() {
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
export function formatWattage(wattage) {
    return `${wattage}W`;
}
/**
 * Example usage and testing function
 */
export function testWattageCalculation() {
    console.log('=== WRGB Pro II Wattage Calculator Test ===');
    // Test case 1: All channels at 50%
    const test1 = calculateLightWattage({ red: 50, green: 50, blue: 50, white: 50 });
    console.log('50% all channels:', test1);
    // Test case 2: All channels at 100%
    const test2 = calculateLightWattage({ red: 100, green: 100, blue: 100, white: 100 });
    console.log('100% all channels:', test2);
    // Test case 3: Mixed percentages
    const test3 = calculateLightWattage({ red: 75, green: 60, blue: 40, white: 80 });
    console.log('Mixed percentages:', test3);
    // Test case 4: Maximum possible
    const test4 = calculateLightWattage({ red: 140, green: 140, blue: 140, white: 140 });
    console.log('Maximum possible:', test4);
    console.log('Max rated wattage:', getMaxWattage() + 'W');
}
