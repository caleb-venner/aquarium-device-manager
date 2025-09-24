import { defineConfig } from "vite";

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
    sourcemap: true
  }
});
