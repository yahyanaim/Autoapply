import { Logger } from '@nestjs/common';
import { MfaService } from '../infrastructure/mfa.service';

describe('MfaService', () => {
  const createConfig = (nodeEnv = 'test', encryptionKey = '') => ({
    get: jest.fn((key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY') return encryptionKey;
      if (key === 'NODE_ENV') return nodeEnv;
      return undefined;
    }),
    getOrThrow: jest.fn().mockReturnValue('test-jwt-secret-that-is-long-enough'),
  });

  const createPrisma = () => ({
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  });

  it('encrypts enrollment secrets and verifies a valid time-based code', () => {
    const service = new MfaService(
      createConfig() as never,
      createPrisma() as never,
    );
    const enrollment = service.createEnrollment('person@example.com');
    const timestamp = Date.now();
    const code = service.generateCode(enrollment.secret, timestamp);

    expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrollment.otpAuthUri).toContain('otpauth://totp/');
    expect(enrollment.encryptedSecret).not.toContain(enrollment.secret);
    expect(service.verifyCode(enrollment.secret, code, timestamp)).toBe(true);
    expect(
      service.verifyEncryptedSecret(enrollment.encryptedSecret, code),
    ).toBe(true);
  });

  it('accepts only six-digit codes in the configured time window', () => {
    const service = new MfaService(
      createConfig() as never,
      createPrisma() as never,
    );
    const secret = 'JBSWY3DPEHPK3PXP';
    const timestamp = 1_800_000_000_000;
    const code = service.generateCode(secret, timestamp);

    expect(service.verifyCode(secret, code, timestamp)).toBe(true);
    expect(service.verifyCode(secret, 'abcdef', timestamp)).toBe(false);
    expect(service.verifyCode(secret, code, timestamp + 120_000)).toBe(false);
  });

  it('fails at startup when the production MFA encryption key is absent', () => {
    const service = new MfaService(
      createConfig('production') as never,
      createPrisma() as never,
    );

    expect(() => service.onModuleInit()).toThrow(
      'MFA_ENCRYPTION_KEY is required in production',
    );
  });

  it('warns once when development uses the JWT-derived MFA key fallback', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new MfaService(
      createConfig('development') as never,
      createPrisma() as never,
    );

    service.onModuleInit();
    service.onModuleInit();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'MFA_ENCRYPTION_KEY is not configured; using the development-only JWT_SECRET-derived MFA key',
    );
    warn.mockRestore();
  });

  it('consumes a TOTP step once and accepts a later step', async () => {
    const timestamp = 1_800_000_000_000;
    const clock = {
      now: jest.fn(() => new Date(timestamp)),
      nowMs: jest.fn(() => timestamp),
    };
    const prisma = createPrisma();
    prisma.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const service = new MfaService(
      createConfig() as never,
      prisma as never,
      clock as never,
    );
    const enrollment = service.createEnrollment('person@example.com');
    const firstCode = service.generateCode(enrollment.secret, timestamp);
    const firstStep = Math.floor(timestamp / 30_000);

    await expect(
      service.verifyAndConsumeEncryptedSecret(
        'user_123',
        enrollment.encryptedSecret,
        firstCode,
      ),
    ).resolves.toBe(true);
    await expect(
      service.verifyAndConsumeEncryptedSecret(
        'user_123',
        enrollment.encryptedSecret,
        firstCode,
      ),
    ).resolves.toBe(false);

    expect(prisma.user.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'user_123',
        OR: [
          { mfaLastUsedStep: null },
          { mfaLastUsedStep: { lt: firstStep } },
        ],
      },
      data: { mfaLastUsedStep: firstStep },
    });

    clock.nowMs.mockReturnValue(timestamp + 30_000);
    const laterCode = service.generateCode(
      enrollment.secret,
      timestamp + 30_000,
    );
    await expect(
      service.verifyAndConsumeEncryptedSecret(
        'user_123',
        enrollment.encryptedSecret,
        laterCode,
      ),
    ).resolves.toBe(true);
  });
});
