import { defineConfig } from "next/experimental/testmode/playwright";

// Limit projects to Chromium and Firefox to avoid missing dependencies for Webkit
import type { PlaywrightTestConfig } from "@playwright/test";

/*
 * Specify any additional Playwright config options here.
 * They will be merged with Next.js' default Playwright config.
 * You can access the default config by importing `defaultPlaywrightConfig` from `'next/experimental/testmode/playwright'`.
 */
const config: PlaywrightTestConfig = {
  // Restrict tests to the dedicated tests directory
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  globalSetup: require.resolve("./global-setup.js"),
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer: {
    // Resolve Next.js binary from local node_modules to avoid PATH issues
    command: "./node_modules/.bin/next dev --port 3000",
    url: "http://127.0.0.1:3000/",
    reuseExistingServer: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180000,
  },
};

export default defineConfig(config);
