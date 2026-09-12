import { initializeServerSentry } from './src/lib/observability/sentry';

export async function initializeSentryForEdge(): Promise<void> {
  await initializeServerSentry('edge');
}
