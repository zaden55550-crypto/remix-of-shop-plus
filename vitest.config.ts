import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Screen tests load the whole app, which can take a while on a busy machine.
    testTimeout: 20000,
    // Database tests start a real PostgreSQL engine; too many at once starve each other.
    hookTimeout: 180000,
    maxWorkers: 4,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
