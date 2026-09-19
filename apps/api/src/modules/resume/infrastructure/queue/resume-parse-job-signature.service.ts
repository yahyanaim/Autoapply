import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  ResumeParseJobData,
  ResumeParseJobIdentity,
} from '../../application/resume.service';

/**
 * Signs the small, server-generated identity attached to a resume queue job.
 * It is deliberately independent from JWT/MFA keys: a queue compromise must
 * not gain a credential for any other security domain.
 */
@Injectable()
export class ResumeParseJobSignatureService {
  constructor(private readonly configService: ConfigService) {}

  sign(identity: ResumeParseJobIdentity): string {
    return createHmac('sha256', this.signingKey())
      .update(this.canonicalPayload(identity))
      .digest('hex');
  }

  verify(payload: ResumeParseJobData): boolean {
    if (!/^[a-f0-9]{64}$/.test(payload.signature)) return false;
    const expected = this.sign(payload);
    return timingSafeEqual(
      Buffer.from(payload.signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  private signingKey(): string {
    const key = this.configService.get<string>('RESUME_QUEUE_SIGNING_KEY');
    if (!key) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'RESUME_QUEUE_UNAVAILABLE',
        retryable: false,
        message: 'Resume processing is temporarily unavailable.',
      });
    }
    return key;
  }

  private canonicalPayload(identity: ResumeParseJobIdentity): string {
    // Length prefixes keep the representation unambiguous without ever
    // serializing arbitrary job data, original filenames, or CV contents.
    return [
      identity.resumeId,
      identity.userId,
      identity.executionBoundary,
      identity.jobId,
    ]
      .map((value) => `${Buffer.byteLength(value)}:${value}`)
      .join('|');
  }
}
