import { BadRequestException } from '@nestjs/common';
import { requireIdempotencyKey } from './idempotency-key';

describe('requireIdempotencyKey', () => {
  it('accepts a bounded opaque key and trims surrounding whitespace', () => {
    expect(requireIdempotencyKey('  optimize:12345678-1234-1234-1234  ')).toBe(
      'optimize:12345678-1234-1234-1234',
    );
  });

  it.each([
    undefined,
    '',
    'too-short',
    'contains spaces 12345678',
    `too-long:${'x'.repeat(121)}`,
  ])('rejects an absent or unsafe key: %p', (value) => {
    expect(() => requireIdempotencyKey(value)).toThrow(BadRequestException);
  });
});
