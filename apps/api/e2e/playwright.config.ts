import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /core-flow\.e2e\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_API_URL || 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
});
