import { defineConfig } from "@playwright/test";
export default defineConfig({
  globalSetup: require.resolve("../global-setup.js"),
  testDir: __dirname,
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ignoreHTTPSErrors: true,
        baseURL: "https://localhost:3000",
      },
    },
  ],
  webServer: {
    command: "pnpm run dev --silent",
    port: 3000,
    reuseExistingServer: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 120000,
  },
});
