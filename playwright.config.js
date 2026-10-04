import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 1280, height: 900 },
    headless: true,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    },
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  webServer: process.env.EXTERNAL_SERVER
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4175",
        url: "http://127.0.0.1:4175",
        reuseExistingServer: true,
      },
});
