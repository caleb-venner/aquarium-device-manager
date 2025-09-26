import "../style.css";
import { renderDeviceSection } from "./deviceCard";
import { renderDoserDashboard, renderLightDashboard } from "./dashboards";

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

root.innerHTML = `
  <main style="padding: 1rem;">
    <h1>UI Module Smoke Test</h1>
    <section>
      <h2>Device Section</h2>
      ${renderDeviceSection(sampleEntries, "No devices")}
    </section>
    <section>
      <h2>Doser Dashboard</h2>
      ${renderDoserDashboard(sampleEntries)}
    </section>
    <section>
      <h2>Light Dashboard</h2>
      ${renderLightDashboard(sampleEntries)}
    </section>
  </main>
`;
