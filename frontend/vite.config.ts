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
  plugins: [
    {
      name: 'custom-routes',
      configureServer(server) {
        const rewrite = (url?: string) => {
          if (!url) return undefined;
          const [pathname, search = ""] = url.split("?");
          if (pathname === "/dev" || pathname === "/dev/") {
            return `/dev/index.html${search ? `?${search}` : ""}`;
          }
          if (pathname === "/test" || pathname === "/test/") {
            return `/test/index.html${search ? `?${search}` : ""}`;
          }
          return undefined;
        };

        server.middlewares.use((req, _res, next) => {
          const rewritten = rewrite(req.url);
          if (rewritten) {
            req.url = rewritten;
          }
          next();
        });
      },
      configurePreviewServer(server) {
        const rewrite = (url?: string) => {
          if (!url) return undefined;
          const [pathname, search = ""] = url.split("?");
          if (pathname === "/dev" || pathname === "/dev/") {
            return `/dev/index.html${search ? `?${search}` : ""}`;
          }
          if (pathname === "/test" || pathname === "/test/") {
            return `/test/index.html${search ? `?${search}` : ""}`;
          }
          return undefined;
        };

        server.middlewares.use((req, _res, next) => {
          const rewritten = rewrite(req.url);
          if (rewritten) {
            req.url = rewritten;
          }
          next();
        });
      }
    }
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        dev: resolve(__dirname, "dev/index.html"),
        test: resolve(__dirname, "test/index.html"),
        wattageTest: resolve(__dirname, "test/wattage-test.html"),
        percentagesTest: resolve(__dirname, "test/percentages-test.html")
      }
    }
  }
});
