import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestObservabilityInterceptor } from './request-observability.interceptor';
import { RequestContextService } from './request-context.service';

describe('RequestObservabilityInterceptor denial audit classification', () => {
  const prisma = { activityLog: { create: jest.fn() } };
  const requestContext = new RequestContextService();
  const interceptor = new RequestObservabilityInterceptor(
    requestContext,
    prisma as never,
  );
  const request = {
    ip: '192.0.2.1',
    get: jest.fn(() => 'ApplyAI-Test/1.0'),
  };
  const recordFailure = (
    interceptor as unknown as {
      recordFailure: (...args: unknown[]) => Promise<void>;
    }
  ).recordFailure.bind(interceptor);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.activityLog.create.mockResolvedValue({ id: 'denial-audit-1' });
  });

  it('uses access_denied only for HTTP 401/403 request denials without raw network metadata', async () => {
    await recordFailure(
      new UnauthorizedException(),
      request,
      'request_12345678',
      'user-1',
      10,
    );

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'access_denied',
        ipAddress: undefined,
        userAgent: undefined,
        metadata: { event: 'access_denied', requestId: 'request_12345678', statusCode: 401 },
      }),
    });
    expect(JSON.stringify(prisma.activityLog.create.mock.calls)).not.toMatch(
      /192\.0\.2\.1|ApplyAI-Test\/1\.0/,
    );

    prisma.activityLog.create.mockClear();
    await recordFailure(
      new ForbiddenException(),
      request,
      'request_12345678',
      'user-1',
      10,
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'access_denied',
        ipAddress: undefined,
        userAgent: undefined,
        metadata: { event: 'access_denied', requestId: 'request_12345678', statusCode: 403 },
      }),
    });

    prisma.activityLog.create.mockClear();
    await recordFailure(
      new ConflictException(),
      request,
      'request_12345678',
      'user-1',
      10,
    );
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });
});
