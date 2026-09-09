import Joi from 'joi';

/**
 * Redis backs distributed throttling and background queues. A local default is
 * useful for development, but a production process must name its real shared
 * Redis instance explicitly.
 */
export function redisUrlSchema() {
  return Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('redis://localhost:6379'),
    });
}
