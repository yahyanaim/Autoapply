import { MfaService } from '../infrastructure/mfa.service';

describe('MfaService', () => {
  const config = {
    get: jest.fn().mockReturnValue(''),
    getOrThrow: jest.fn().mockReturnValue('test-jwt-secret-that-is-long-enough'),
  };
  const service = new MfaService(config as never);

  it('encrypts enrollment secrets and verifies a valid time-based code', () => {
    const enrollment = service.createEnrollment('person@example.com');
    const timestamp = Date.now();
    const code = service.generateCode(enrollment.secret, timestamp);

    expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrollment.otpAuthUri).toContain('otpauth://totp/');
    expect(enrollment.encryptedSecret).not.toContain(enrollment.secret);
    expect(
      service.verifyCode(enrollment.secret, code, timestamp),
    ).toBe(true);
    expect(
      service.verifyEncryptedSecret(enrollment.encryptedSecret, code),
    ).toBe(true);
  });

  it('accepts only six-digit codes in the configured time window', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const timestamp = 1_800_000_000_000;
    const code = service.generateCode(secret, timestamp);

    expect(service.verifyCode(secret, code, timestamp)).toBe(true);
    expect(service.verifyCode(secret, 'abcdef', timestamp)).toBe(false);
    expect(service.verifyCode(secret, code, timestamp + 120_000)).toBe(false);
  });
});
