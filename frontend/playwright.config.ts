import { defineConfig } from "next/experimental/testmode/playwright";

// Limit projects to Chromium and Firefox to avoid missing dependencies for Webkit
import type { PlaywrightTestConfig } from "@playwright/test";

/*
 * Specify any additional Playwright config options here.
 * They will be merged with Next.js' default Playwright config.
 * You can access the default config by importing `defaultPlaywrightConfig` from `'next/experimental/testmode/playwright'`.
 */
const config: PlaywrightTestConfig = {
  globalSetup: require.resolve("./global-setup.js"),
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
};

export default defineConfig(config);
