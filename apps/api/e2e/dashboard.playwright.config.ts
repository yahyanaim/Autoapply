import { defineConfig, devices } from '@playwright/test';

const configuredBaseUrl = process.env.E2E_DASHBOARD_URL?.replace(/\/$/, '');
const localBaseUrl = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: '.',
  testMatch: /critical-flow\.e2e\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  use: {
    baseURL: configuredBaseUrl || localBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: configuredBaseUrl
    ? undefined
    : {
        command:
          'pnpm --dir ../../dashboard dev --hostname 127.0.0.1 --port 3100',
        url: `${localBaseUrl}/register`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
        },
      },
});
