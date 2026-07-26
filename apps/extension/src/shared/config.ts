const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const defaultApiBase = import.meta.env.PROD
  ? 'https://api.applyai.com'
  : 'http://localhost:3001';

export const API_BASE_URL = (configuredApiBase || defaultApiBase).replace(/\/+$/, '');

const configuredDashboardBase = import.meta.env.VITE_DASHBOARD_URL?.trim();
const defaultDashboardBase = import.meta.env.PROD
  ? 'https://app.applyai.com'
  : 'http://localhost:3000';

export const DASHBOARD_BASE_URL = (
  configuredDashboardBase || defaultDashboardBase
).replace(/\/+$/, '');

export const TRUSTED_DASHBOARD_ORIGINS = new Set([
  new URL(DASHBOARD_BASE_URL).origin,
  'https://app.applyai.com',
  'https://staging.applyai.com',
]);
