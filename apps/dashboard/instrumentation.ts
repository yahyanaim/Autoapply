export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeSentryForNode } = await import('./sentry.server.config');
    await initializeSentryForNode();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const { initializeSentryForEdge } = await import('./sentry.edge.config');
    await initializeSentryForEdge();
  }
}
