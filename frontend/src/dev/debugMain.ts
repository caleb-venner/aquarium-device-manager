// Simplified Dashboard - Debug Version
// Test each import individually to find the issue

// Debug function to update status
function updateDebugStatus(message: string): void {
  const debug = document.getElementById('debug-status');
  if (debug) {
    const stepCount = parseInt(debug.textContent?.match(/Step (\d+):/)?.[1] || '0') + 1;
    debug.textContent = `Step ${stepCount}: ${message}`;
  }
  console.log(`🚀 Debug: ${message}`);
}

// Test imports one by one
document.addEventListener("DOMContentLoaded", async () => {
  updateDebugStatus("DOM loaded, testing imports...");

  try {
    updateDebugStatus("Testing device store import...");
    const storeModule = await import("../stores/deviceStore");
    updateDebugStatus("✅ Store imported successfully");

    const { useActions, useDevices } = storeModule;
    updateDebugStatus(`Store functions: useActions=${typeof useActions}, useDevices=${typeof useDevices}`);

    updateDebugStatus("Testing notifications import...");
    const notificationsModule = await import("../ui/notifications");
    updateDebugStatus("✅ Notifications imported successfully");

    updateDebugStatus("Testing dashboard import...");
    const dashboardModule = await import("../ui/modernDashboard");
    updateDebugStatus("✅ Dashboard imported successfully");

    updateDebugStatus("Testing state subscriptions import...");
    const subscriptionsModule = await import("../ui/stateSubscriptions");
    updateDebugStatus("✅ Subscriptions imported successfully");

    updateDebugStatus("All imports successful! Testing store...");

    // Test the store
    const devices = useDevices();
    updateDebugStatus(`Store working: ${devices.length} devices`);

    // Test API call
    updateDebugStatus("Testing API call...");
    const { refreshDevices } = useActions();
    await refreshDevices();
    updateDebugStatus("✅ API call successful");

    // Test dashboard render
    updateDebugStatus("Testing dashboard render...");
    const { renderModernDashboard } = dashboardModule;
    const html = renderModernDashboard();
    updateDebugStatus(`Dashboard rendered: ${html.length} chars`);

    // Show result
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="padding: 20px; background: #e6ffe6; border: 1px solid green;">
          <h2>✅ All Tests Passed!</h2>
          <p>The dashboard is working. Dashboard HTML length: ${html.length} characters</p>
          <button onclick="location.href='/'">Go to Full Dashboard</button>
        </div>
      `;
    }

    updateDebugStatus("🎉 All tests completed successfully!");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace available';

    updateDebugStatus(`❌ Error: ${errorMessage}`);
    console.error('Import test failed:', error);

    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="padding: 20px; background: #ffe6e6; border: 1px solid red;">
          <h2>❌ Import Test Failed</h2>
          <p><strong>Error:</strong> ${errorMessage}</p>
          <details>
            <summary>Stack Trace</summary>
            <pre style="font-size: 12px; white-space: pre-wrap;">${errorStack}</pre>
          </details>
        </div>
      `;
    }
  }
});
