// Simple test for the wattage calculator
const WRGB_PRO_II_WATTAGE_DATA = {
  "Red": {
    "Wattage": [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62],
    "Percentage": ["1%", "3%", "7%", "11%", "15%", "18%", "22%", "26%", "29%", "33%", "36%", "39%", "43%", "46%", "49%", "52%", "55%", "58%", "61%", "64%", "67%", "69%", "72%", "75%", "77%", "80%", "83%", "85%", "88%", "90%", "93%", "95%", "98%", "100%", "103%", "105%", "108%", "110%", "113%", "115%", "118%", "120%", "123%", "125%", "128%", "130%", "132%", "135%", "137%", "139%"]
  },
  "Green": {
    "Wattage": [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87],
    "Percentage": ["1%", "2%", "5%", "7%", "10%", "13%", "15%", "18%", "21%", "23%", "26%", "28%", "30%", "33%", "35%", "37%", "40%", "42%", "44%", "46%", "48%", "50%", "53%", "55%", "57%", "59%", "61%", "63%", "65%", "67%", "69%", "71%", "73%", "74%", "76%", "78%", "80%", "82%", "84%", "86%", "87%", "89%", "91%", "93%", "94%", "96%", "98%", "100%", "101%", "103%", "105%", "106%", "108%", "110%", "111%", "113%", "114%", "116%", "118%", "119%", "121%", "122%", "124%", "126%", "127%", "129%", "130%", "132%", "133%", "135%", "136%", "138%", "139%"]
  },
  "Blue": {
    "Wattage": [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40],
    "Percentage": ["1%", "4%", "9%", "15%", "21%", "27%", "32%", "38%", "43%", "48%", "53%", "58%", "63%", "68%", "73%", "78%", "82%", "87%", "91%", "96%", "100%", "105%", "110%", "114%", "119%", "124%", "128%", "133%", "137%"]
  },
  "White": {
    "Wattage": [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50],
    "Percentage": ["1%", "3%", "9%", "15%", "20%", "25%", "31%", "36%", "41%", "46%", "51%", "56%", "61%", "66%", "70%", "75%", "80%", "84%", "89%", "93%", "97%", "101%", "104%", "106%", "109%", "111%", "113%", "116%", "118%", "120%", "123%", "125%", "127%", "129%", "132%", "134%", "136%", "138%", "140%"]
  }
};

function parsePercentage(percentageStr) {
  return parseInt(percentageStr.replace('%', ''), 10);
}

function calculateChannelWattage(percentage, channelData) {
  if (percentage <= 0) return 0;

  // Convert percentage strings to numbers for comparison
  const thresholds = channelData.Percentage.map(parsePercentage);
  const wattages = channelData.Wattage;

  // Find the appropriate wattage step, but ensure we don't exceed wattage array length
  for (let i = 0; i < thresholds.length && i < wattages.length; i++) {
    if (percentage <= thresholds[i]) {
      return wattages[i];
    }
  }

  // If percentage exceeds all thresholds, return the maximum wattage
  return wattages[wattages.length - 1];
}

function calculateLightWattage(channels) {
  // First, calculate what each channel would use without power limiting
  const requestedChannelWattages = {
    red: calculateChannelWattage(channels.red, WRGB_PRO_II_WATTAGE_DATA.Red),
    green: calculateChannelWattage(channels.green, WRGB_PRO_II_WATTAGE_DATA.Green),
    blue: calculateChannelWattage(channels.blue, WRGB_PRO_II_WATTAGE_DATA.Blue),
    white: calculateChannelWattage(channels.white, WRGB_PRO_II_WATTAGE_DATA.White)
  };

  const requestedWattage = requestedChannelWattages.red + requestedChannelWattages.green +
                          requestedChannelWattages.blue + requestedChannelWattages.white;

  // Apply 138W power limiting
  const MAX_TOTAL_WATTAGE = 138;
  let channelWattages = { ...requestedChannelWattages };
  let totalWattage = requestedWattage;
  let powerLimited = false;

  if (requestedWattage > MAX_TOTAL_WATTAGE) {
    // Scale down all channels proportionally to stay within power limit
    const scaleFactor = MAX_TOTAL_WATTAGE / requestedWattage;
    channelWattages = {
      red: Math.round(requestedChannelWattages.red * scaleFactor),
      green: Math.round(requestedChannelWattages.green * scaleFactor),
      blue: Math.round(requestedChannelWattages.blue * scaleFactor),
      white: Math.round(requestedChannelWattages.white * scaleFactor)
    };
    totalWattage = channelWattages.red + channelWattages.green + channelWattages.blue + channelWattages.white;
    powerLimited = true;
  }

  // Calculate efficiency based on actual device maximum (138W)
  const efficiency = Math.round((totalWattage / MAX_TOTAL_WATTAGE) * 100);

  return {
    totalWattage,
    channelWattages,
    requestedWattage,
    powerLimited,
    efficiency
  };
}

function getMaxWattage() {
  return 138; // Actual device power limit
}

function getTheoreticalMaxWattage() {
  const maxWattages = {
    red: WRGB_PRO_II_WATTAGE_DATA.Red.Wattage[WRGB_PRO_II_WATTAGE_DATA.Red.Wattage.length - 1],
    green: WRGB_PRO_II_WATTAGE_DATA.Green.Wattage[WRGB_PRO_II_WATTAGE_DATA.Green.Wattage.length - 1],
    blue: WRGB_PRO_II_WATTAGE_DATA.Blue.Wattage[WRGB_PRO_II_WATTAGE_DATA.Blue.Wattage.length - 1],
    white: WRGB_PRO_II_WATTAGE_DATA.White.Wattage[WRGB_PRO_II_WATTAGE_DATA.White.Wattage.length - 1]
  };

  return maxWattages.red + maxWattages.green + maxWattages.blue + maxWattages.white;
}

console.log('=== WRGB Pro II Wattage Calculator Test ===');
console.log('Device power limit: 138W');
console.log('Theoretical max (if no limiting): ' + getTheoreticalMaxWattage() + 'W');
console.log('Individual max wattages: R:62W G:87W B:40W W:50W');
console.log('');

const tests = [
  { name: '0% all channels (off)', values: { red: 0, green: 0, blue: 0, white: 0 } },
  { name: '50% all channels', values: { red: 50, green: 50, blue: 50, white: 50 } },
  { name: '75% all channels', values: { red: 75, green: 75, blue: 75, white: 75 } },
  { name: '100% all channels', values: { red: 100, green: 100, blue: 100, white: 100 } },
  { name: 'Mixed levels', values: { red: 75, green: 60, blue: 40, white: 80 } },
  { name: '120% all channels (should be power limited)', values: { red: 120, green: 120, blue: 120, white: 120 } },
  { name: 'Maximum possible (should be power limited)', values: { red: 139, green: 139, blue: 137, white: 140 } },
  { name: 'Red only at 100%', values: { red: 100, green: 0, blue: 0, white: 0 } },
  { name: 'Green only at 139% (max)', values: { red: 0, green: 139, blue: 0, white: 0 } }
];

tests.forEach(test => {
  const result = calculateLightWattage(test.values);
  console.log(test.name + ':');
  if (result.powerLimited) {
    console.log('  🔋 POWER LIMITED: ' + result.requestedWattage + 'W requested → ' + result.totalWattage + 'W actual');
  } else {
    console.log('  Total: ' + result.totalWattage + 'W (' + result.efficiency + '% efficiency)');
  }
  console.log('  R:' + result.channelWattages.red + 'W G:' + result.channelWattages.green + 'W B:' + result.channelWattages.blue + 'W W:' + result.channelWattages.white + 'W');
  console.log('');
});
