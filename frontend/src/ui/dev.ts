import "../style.css";
import { renderDeviceCard as renderModernDeviceCard } from "./modernDeviceCard";

const root = document.getElementById("dev-root") ?? document.body;

// Fake sample data to exercise renderers
const sampleEntries = [
  {
    address: "AA:BB:CC:DD:EE:01",
    status: {
      device_type: "light",
      raw_payload: "0A0B0C",
      parsed: {
        weekday: 1,
        current_hour: 12,
        current_minute: 30,
        keyframes: [
          { hour: 8, minute: 0, value: 255, percent: 100 },
          { hour: 20, minute: 0, value: 0, percent: 0 },
        ],
      },
      updated_at: Math.floor(Date.now() / 1000),
      model_name: "Test Light",
      connected: true,
    },
  },
  {
    address: "AA:BB:CC:DD:EE:02",
    status: {
      device_type: "doser",
      raw_payload: "010203",
      parsed: {
        weekday: 2,
        hour: 9,
        minute: 15,
        heads: [
          { mode: 1, hour: 9, minute: 15, dosed_tenths_ml: 50 },
        ],
      },
      updated_at: Math.floor(Date.now() / 1000),
      model_name: "Test Doser",
      connected: false,
    },
  },
];

// Convert sample entries to modern format
const convertToModernFormat = (entries: any[]): any[] =>
  entries.map(entry => ({
    address: entry.address,
    status: entry.status,
    isLoading: false,
    error: null,
    lastUpdated: entry.status.updated_at * 1000,
    commandHistory: [],
  }));

const modernEntries = convertToModernFormat(sampleEntries);
const lightEntries = modernEntries.filter(e => e.status.device_type === "light");
const doserEntries = modernEntries.filter(e => e.status.device_type === "doser");

root.innerHTML = `
  <main style="padding: 1rem;">
    <h1>UI Module Smoke Test</h1>
    <section>
      <h2>Modern Device Cards</h2>
      <div class="device-grid">
        ${lightEntries.length > 0 ? `
          <section class="device-section">
            <h3>Light Devices</h3>
            <div class="device-cards">
              ${lightEntries.map(device => renderModernDeviceCard(device)).join('')}
            </div>
          </section>
        ` : ''}
        ${doserEntries.length > 0 ? `
          <section class="device-section">
            <h3>Doser Devices</h3>
            <div class="device-cards">
              ${doserEntries.map(device => renderModernDeviceCard(device)).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    </section>
  </main>
`;
