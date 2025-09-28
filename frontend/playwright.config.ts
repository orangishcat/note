import { defineConfig } from "next/experimental/testmode/playwright";
import type { PlaywrightTestConfig } from "@playwright/test";
const config: PlaywrightTestConfig = {
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  globalSetup: require.resolve("./global-setup.js"),
  use: {
    baseURL: "http://127.0.0.1:3002",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer: {
    command: "./node_modules/.bin/next dev --port 3002",
    url: "http://127.0.0.1:3002/",
    reuseExistingServer: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180000,
  },
};
export default defineConfig(config);
