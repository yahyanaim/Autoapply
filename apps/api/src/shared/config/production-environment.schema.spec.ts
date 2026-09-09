import Joi from 'joi';
import { redisUrlSchema } from './production-environment.schema';

describe('production environment schema', () => {
  const schema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
    REDIS_URL: redisUrlSchema(),
  });

  it('requires an explicit shared Redis URL in production', () => {
    const result = schema.validate({ NODE_ENV: 'production' });

    expect(result.error?.message).toContain('REDIS_URL');
  });

  it('accepts a managed Redis URL in production', () => {
    const result = schema.validate({
      NODE_ENV: 'production',
      REDIS_URL: 'rediss://default:password@redis.example.com:6380',
    });

    expect(result.error).toBeUndefined();
  });

  it('keeps the local Redis default outside production', () => {
    const result = schema.validate({ NODE_ENV: 'test' });

    expect(result.error).toBeUndefined();
    expect(result.value.REDIS_URL).toBe('redis://localhost:6379');
  });
});
