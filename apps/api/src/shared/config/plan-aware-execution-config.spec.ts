import { planAwareExecutionConfigurationError } from './plan-aware-execution-config';

const freeGlmConfig = {
  AI_EXECUTION_ROLE: 'free',
  FREE_AI_PROVIDER: 'glm',
  GLM_FREE_PLAN_API_KEY: 'synthetic-key',
  GLM_FREE_PLAN_MODEL: 'glm-test-model',
  GLM_FREE_PLAN_BASE_URL: 'https://glm.example.test/v1',
};

describe('plan-aware execution configuration', () => {
  it('requires GLM configuration only when a process can execute Free work', () => {
    expect(
      planAwareExecutionConfigurationError({
        AI_EXECUTION_ROLE: 'paid',
        FREE_AI_PROVIDER: 'glm',
      }),
    ).toBeUndefined();

    expect(
      planAwareExecutionConfigurationError({
        ...freeGlmConfig,
        GLM_FREE_PLAN_API_KEY: '',
      }),
    ).toBe('GLM_FREE_PLAN_API_KEY is required for Free-plan GLM execution');
  });

  it('rejects an unsafe GLM endpoint without returning its value', () => {
    expect(
      planAwareExecutionConfigurationError({
        ...freeGlmConfig,
        GLM_FREE_PLAN_BASE_URL: 'http://127.0.0.1:3000/private-key',
      }),
    ).toBe('GLM_FREE_PLAN_BASE_URL must be a public HTTPS base URL');
  });

  it('requires a complete credential pair for a custom S3-compatible endpoint', () => {
    expect(
      planAwareExecutionConfigurationError({
        ...freeGlmConfig,
        S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        S3_ACCESS_KEY_ID: 'synthetic-access-key',
      }),
    ).toBe('S3_SECRET_ACCESS_KEY is required when S3_ENDPOINT is configured');
  });
});
