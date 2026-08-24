import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const devApiTarget =
  process.env.ABYSS_DASHBOARD_DEV_API_TARGET ?? "http://127.0.0.1:8080";
const devApiToken = process.env.ABYSS_DASHBOARD_DEV_API_TOKEN;
const devProxyHeaders = {
  "x-forwarded-host": "127.0.0.1:5173",
  "x-forwarded-prefix": "/api",
  "x-forwarded-proto": "http",
  ...(devApiToken ? { authorization: `Bearer ${devApiToken}` } : {}),
};

export default defineConfig(({ command }) => {
  if (command === "serve" && process.env.VITEST === undefined && !devApiToken) {
    throw new Error(
      "ABYSS_DASHBOARD_DEV_API_TOKEN is required to proxy dashboard API requests",
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.VITE_BASENAME": JSON.stringify(process.env.VITE_BASENAME ?? ""),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: devApiTarget,
          changeOrigin: true,
          headers: devProxyHeaders,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ""),
        },
      },
    },
    test: {
      css: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
