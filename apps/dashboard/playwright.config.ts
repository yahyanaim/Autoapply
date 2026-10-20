import { defineConfig } from "@playwright/test";

const configuredBaseUrl = process.env.E2E_DASHBOARD_URL?.replace(/\/$/, "");
const localBaseUrl = "http://127.0.0.1:3191";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /landing-(marquee|session)\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: configuredBaseUrl || localBaseUrl,
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    locale: "en-US",
    contextOptions: { reducedMotion: "no-preference" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: configuredBaseUrl
    ? undefined
    : {
        command: "pnpm dev --hostname 127.0.0.1 --port 3191",
        url: localBaseUrl,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
