import { ServiceUnavailableException } from '@nestjs/common';
import { ResumeParseJobSignatureService } from '../infrastructure/queue/resume-parse-job-signature.service';

describe('ResumeParseJobSignatureService', () => {
  const values: Record<string, string | undefined> = {
    RESUME_QUEUE_SIGNING_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  };
  const signer = new ResumeParseJobSignatureService(config as never);

  beforeEach(() => {
    values.RESUME_QUEUE_SIGNING_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('accepts only the exact server-signed job identity', () => {
    const identity = {
      resumeId: 'resume-1',
      userId: 'user-1',
      executionBoundary: 'free' as const,
      jobId: 'resume-parse-free-resume-1',
    };
    const signature = signer.sign(identity);

    expect(signer.verify({ ...identity, signature })).toBe(true);
    expect(
      signer.verify({ ...identity, resumeId: 'resume-2', signature }),
    ).toBe(false);
    expect(
      signer.verify({ ...identity, userId: 'user-2', signature }),
    ).toBe(false);
    expect(
      signer.verify({ ...identity, executionBoundary: 'paid', signature }),
    ).toBe(false);
    expect(
      signer.verify({ ...identity, jobId: 'replayed-job', signature }),
    ).toBe(false);
  });

  it('fails closed when the dedicated queue signing key is unavailable', () => {
    values.RESUME_QUEUE_SIGNING_KEY = '';

    expect(() =>
      signer.sign({
        resumeId: 'resume-1',
        userId: 'user-1',
        executionBoundary: 'free',
        jobId: 'resume-parse-free-resume-1',
      }),
    ).toThrow(ServiceUnavailableException);
  });
});
