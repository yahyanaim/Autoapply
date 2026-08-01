import { BadRequestException } from '@nestjs/common';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

/**
 * Public mutation endpoints require an opaque, user-generated key. Restricting
 * its shape keeps it safe to log as structured metadata and use in indexes.
 */
export function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      'Idempotency-Key must contain 16 to 128 letters, numbers, dots, underscores, colons, or hyphens',
    );
  }
  return key;
}
