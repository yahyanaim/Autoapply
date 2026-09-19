import { parseExternalHttpsBaseUrl } from './external-endpoint';

/**
 * Cross-field validation shared by the NestJS startup schema and focused unit
 * tests. It returns only configuration-key names, never a configured value.
 */
export function planAwareExecutionConfigurationError(
  configured: Record<string, unknown>,
): string | undefined {
  // The maintenance drain is deliberately non-executing: it only quarantines
  // unsigned legacy jobs and must not require or receive an AI provider key.
  const legacyDrainEnabled =
    configured.RESUME_PARSE_LEGACY_DRAIN_ENABLED === true;
  const canExecuteFree =
    !legacyDrainEnabled && configured.AI_EXECUTION_ROLE !== 'paid';
  if (canExecuteFree && configured.FREE_AI_PROVIDER === 'glm') {
    for (const key of [
      'GLM_FREE_PLAN_API_KEY',
      'GLM_FREE_PLAN_MODEL',
      'GLM_FREE_PLAN_BASE_URL',
    ]) {
      if (!configured[key]) {
        return `${key} is required for Free-plan GLM execution`;
      }
    }
    try {
      parseExternalHttpsBaseUrl(
        String(configured.GLM_FREE_PLAN_BASE_URL),
        'GLM_FREE_PLAN_BASE_URL',
      );
    } catch {
      return 'GLM_FREE_PLAN_BASE_URL must be a public HTTPS base URL';
    }
  }

  if (configured.S3_ENDPOINT) {
    try {
      parseExternalHttpsBaseUrl(
        String(configured.S3_ENDPOINT),
        'S3_ENDPOINT',
      );
    } catch {
      return 'S3_ENDPOINT must be a public HTTPS base URL';
    }
    for (const key of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      if (!configured[key]) {
        return `${key} is required when S3_ENDPOINT is configured`;
      }
    }
  }

  return undefined;
}
