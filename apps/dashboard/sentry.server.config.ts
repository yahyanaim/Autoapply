import { initializeServerSentry } from './src/lib/observability/sentry';

export async function initializeSentryForNode(): Promise<void> {
  await initializeServerSentry('node');
}
