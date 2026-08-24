import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    cssCodeSplit: false,
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "abyss-ui",
      cssFileName: "styles",
    },
    rollupOptions: {
      external: (id) => !id.startsWith(".") && !id.startsWith("/"),
    },
  },
  test: {
    css: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
