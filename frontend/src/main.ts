import "./style.css";
import { renderLayout, setupTabs, setupInteractions } from "./navigation";

// Application entry point
document.addEventListener("DOMContentLoaded", () => {
  renderLayout();
  setupTabs();
  setupInteractions();
});
