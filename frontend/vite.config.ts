import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:8000"
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        legacy: resolve(__dirname, "legacy.html"),
        compare: resolve(__dirname, "compare.html"),
        dev: resolve(__dirname, "dev/index.html"),
        test: resolve(__dirname, "test/index.html"),
        wattageTest: resolve(__dirname, "wattage-test.html"),
        percentagesTest: resolve(__dirname, "percentages-test.html")
      }
    }
  }
});
