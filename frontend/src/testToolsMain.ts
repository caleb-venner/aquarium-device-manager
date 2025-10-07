import "./style.css";
import "./ui/modernDashboard.css";

import { renderWattageTest } from "./testTools/wattageTest";
import { renderPercentagesTest } from "./testTools/percentagesTest";

type TabId = "wattage" | "percentages";

type TabConfig = {
  id: TabId;
  label: string;
  render: (container: HTMLElement) => void;
};

const TABS: TabConfig[] = [
  { id: "wattage", label: "Wattage Test", render: renderWattageTest },
  { id: "percentages", label: "Percentages Test", render: renderPercentagesTest },
];

function buildLayout(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="modern-app legacy-app">
      <header class="modern-header">
        <div class="header-content">
          <div class="brand">
            <h1>🧪 Test Tools</h1>
            <span class="version">Wattage and percentage validation suites</span>
          </div>
          <div class="header-actions">
            <a class="btn btn-sm btn-secondary" href="/" title="Open Modern Dashboard">Modern Dashboard</a>
            <a class="btn btn-sm btn-secondary" href="/dev" title="Open Dev Tools">Dev Tools</a>
          </div>
        </div>
      </header>

      <div class="modern-main legacy-main">
        <div class="legacy-content">
          <nav class="tabs" role="tablist" aria-label="Testing suites">
            ${TABS.map(
              (tab, index) => `
                <button
                  class="tab${index === 0 ? " active" : ""}"
                  role="tab"
                  id="tab-${tab.id}"
                  data-tab="${tab.id}"
                  aria-selected="${index === 0}"
                  aria-controls="panel-${tab.id}"
                  type="button"
                >
                  ${tab.label}
                </button>
              `,
            ).join("")}
            <div class="spacer"></div>
          </nav>

          <div class="legacy-panels">
            ${TABS.map(
              (tab, index) => `
                <section
                  id="panel-${tab.id}"
                  role="tabpanel"
                  aria-labelledby="tab-${tab.id}"
                  ${index === 0 ? "" : "hidden"}
                >
                  <div class="tool-panel" data-panel="${tab.id}"></div>
                </section>
              `,
            ).join("")}
          </div>
        </div>
      </div>

      <footer class="modern-footer">
        <div class="footer-content">
          <span class="footer-info">Chihiros Device Manager • Testing utilities</span>
          <div class="footer-links">
            <a href="/">Modern Dashboard</a>
            <span>•</span>
            <a href="/dev">Dev Tools</a>
          </div>
        </div>
      </footer>
    </div>
  `;
}

function setupTabs(): void {
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tabs .tab"));
  const panels = new Map<TabId, HTMLElement>();
  TABS.forEach((tab) => {
    const panel = document.querySelector<HTMLElement>(`.tool-panel[data-panel="${tab.id}"]`);
    if (panel) panels.set(tab.id, panel);
  });

  function activateTab(id: TabId): void {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === id;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      const panel = document.getElementById(`panel-${button.dataset.tab}`);
      if (panel) {
        if (isActive) {
          panel.removeAttribute("hidden");
        } else {
          panel.setAttribute("hidden", "true");
        }
      }
    });

    const tab = TABS.find((item) => item.id === id);
    const panel = panels.get(id);
    if (!tab || !panel) return;
    tab.render(panel);
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.tab as TabId | undefined;
      if (!tabId) return;
      activateTab(tabId);
    });
  });

  activateTab("wattage");
}

document.addEventListener("DOMContentLoaded", () => {
  buildLayout();
  setupTabs();
});
