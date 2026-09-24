import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AdminAuditService } from './admin-audit.service';

describe('AdminAuditService', () => {
  const activityLog = { create: jest.fn() };
  const transaction = { activityLog };
  const prisma = {
    activityLog: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  let service: AdminAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    activityLog.create.mockResolvedValue({ id: 'audit-1' });
    prisma.activityLog.findMany.mockResolvedValue([]);
    prisma.activityLog.create.mockResolvedValue({ id: 'audit-read-1' });
    service = new AdminAuditService(prisma as unknown as PrismaService);
  });

  it('writes one allow-listed audit row with safe context fields', async () => {
    const suspendedAt = new Date('2026-09-21T12:00:00.000Z');

    await service.write(transaction as never, {
      actorUserId: 'admin-1',
      targetType: 'user',
      targetId: 'user-1',
      action: 'admin.user.suspend',
      correlationId: 'request_12345678',
      ipAddress: '2001:db8::1',
      userAgent: 'ApplyAI-Test/1.0',
      before: { status: 'active', email: 'private@example.com' },
      after: {
        status: 'suspended',
        suspendedAt,
        suspensionReason: 'private reason',
      },
    });

    expect(activityLog.create).toHaveBeenCalledTimes(1);
    expect(activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'admin_user_suspend',
        userId: 'user-1',
        actorUserId: 'admin-1',
        targetType: 'user',
        targetId: 'user-1',
        action: 'admin.user.suspend',
        correlationId: 'request_12345678',
        ipAddress: undefined,
        userAgent: undefined,
        before: { status: 'active' },
        after: {
          status: 'suspended',
          suspendedAt: '2026-09-21T12:00:00.000Z',
        },
      }),
    });
  });

  it('removes request bodies, MFA, tokens, CVs, prompts, payment data, and secrets', async () => {
    await service.write(transaction as never, {
      actorUserId: 'admin-1',
      targetType: 'user',
      targetId: 'user-1',
      action: 'admin.user.suspend',
      correlationId: 'request_12345678',
      userAgent: 'Bearer raw-token',
      before: {
        status: 'active',
        requestBody: { arbitrary: true },
        mfaSecret: 'secret',
        totpCode: '654321',
        token: 'raw-token',
        authorization: 'Bearer raw-token',
        cv: 'raw cv',
        prompt: 'raw prompt',
        generatedDocument: 'raw generated document',
        cardNumber: '4242424242424242',
        paymentData: { amount: 100 },
        password: 'password',
      },
      after: { status: 'suspended', rawProof: 'proof' },
    });

    const persisted = activityLog.create.mock.calls[0][0];
    expect(persisted.data.userAgent).toBeUndefined();
    expect(persisted.data.before).toEqual({ status: 'active' });
    expect(persisted.data.after).toEqual({ status: 'suspended' });
    const serialized = JSON.stringify(persisted);
    for (const sensitive of [
      '654321',
      'raw-token',
      'raw cv',
      'raw prompt',
      'raw generated document',
      '4242424242424242',
      'password',
      'proof',
      'secret',
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it('writes the exact redacted admin.session.revoke audit action', async () => {
    await service.write(transaction as never, {
      actorUserId: 'admin-1',
      targetType: 'session',
      targetId: '7d397356-f8f8-4f8e-9dce-5571bb1e24e0',
      action: 'admin.session.revoke',
      correlationId: 'request_12345678',
      ipAddress: '192.0.2.1',
      userAgent: 'Bearer raw-token',
      before: {
        enabled: true,
        proof: 'raw-proof',
        token: 'raw-token',
        requestBody: { reason: 'private' },
        mfaSecret: 'secret',
      },
      after: { enabled: false, tokenHash: 'hash' },
    });

    expect(activityLog.create).toHaveBeenCalledTimes(1);
    const persisted = activityLog.create.mock.calls[0][0];
    expect(persisted.data).toEqual(expect.objectContaining({
      userId: undefined,
      type: 'admin_session_revoke',
      action: 'admin.session.revoke',
      targetType: 'session',
      targetId: '7d397356-f8f8-4f8e-9dce-5571bb1e24e0',
      before: { enabled: true },
      after: { enabled: false },
      ipAddress: undefined,
      userAgent: undefined,
    }));
    expect(JSON.stringify(persisted)).not.toMatch(
      /raw-proof|raw-token|private|secret|hash|192\.0\.2\.1|Bearer/i,
    );
  });

  it('writes the exact redacted admin.session.revoke_all audit action', async () => {
    await service.write(transaction as never, {
      actorUserId: 'admin-1',
      targetType: 'user',
      targetId: 'user-1',
      action: 'admin.session.revoke_all',
      correlationId: 'request_12345678',
      ipAddress: '192.0.2.1',
      userAgent: 'private-agent/1.0',
      before: { enabled: true, proof: 'raw-proof', token: 'raw-token' },
      after: { enabled: false, revokedSessionCount: 2, requestBody: { private: true } },
    });

    expect(activityLog.create).toHaveBeenCalledTimes(1);
    const persisted = activityLog.create.mock.calls[0][0].data;
    expect(persisted).toEqual(expect.objectContaining({
      userId: 'user-1',
      type: 'admin_session_revoke_all',
      action: 'admin.session.revoke_all',
      targetType: 'user',
      targetId: 'user-1',
      before: { enabled: true },
      after: { enabled: false },
      ipAddress: undefined,
      userAgent: undefined,
    }));
    expect(JSON.stringify(persisted)).not.toMatch(
      /raw-proof|raw-token|private-agent|192\.0\.2\.1|requestBody|revokedSessionCount/i,
    );
  });

  it.each([
    ['admin.activity_log.read', 'admin_activity_log_read'],
    ['admin.user.suspend', 'admin_user_suspend'],
    ['admin.user.reactivate', 'admin_user_reactivate'],
    ['admin.session.revoke', 'admin_session_revoke'],
    ['admin.session.revoke_all', 'admin_session_revoke_all'],
    ['admin.job.deactivate', 'admin_job_deactivate'],
    ['admin.resume.requeue', 'admin_resume_requeue'],
  ] as const)('uses a non-denial type for successful %s events', async (action, type) => {
    await service.write(transaction as never, {
      actorUserId: 'admin-1',
      targetType: action === 'admin.session.revoke' ? 'session' : 'user',
      targetId: 'target-1',
      action,
      correlationId: 'request_12345678',
      before: { enabled: true },
      after: { enabled: false },
    });

    const persisted = activityLog.create.mock.calls[0][0].data;
    expect(persisted.type).toBe(type);
    expect(persisted.type).not.toBe('access_denied');
  });

  it('writes a redacted job-deactivation event without request or credential data', async () => {
    await service.write(transaction as never, {
      actorUserId: 'admin-1',
      targetType: 'job',
      targetId: 'job-1',
      action: 'admin.job.deactivate',
      correlationId: 'request_12345678',
      ipAddress: '192.0.2.1',
      userAgent: 'private-agent',
      before: { status: 'active', proof: 'raw-proof' },
      after: {
        status: 'deactivated',
        reason: 'security_risk',
        deactivatedAt: '2026-09-24T10:00:00.000Z',
        token: 'raw-token',
        requestBody: { secret: 'private' },
      },
    });

    const persisted = activityLog.create.mock.calls[0][0].data;
    expect(persisted).toEqual(
      expect.objectContaining({
        type: 'admin_job_deactivate',
        action: 'admin.job.deactivate',
        targetType: 'job',
        targetId: 'job-1',
        before: { status: 'active' },
        after: {
          status: 'deactivated',
          reason: 'security_risk',
          deactivatedAt: '2026-09-24T10:00:00.000Z',
        },
        ipAddress: undefined,
        userAgent: undefined,
      }),
    );
    expect(JSON.stringify(persisted)).not.toMatch(
      /raw-proof|raw-token|private-agent|192\.0\.2\.1|requestBody|secret/i,
    );
  });

  it('writes a redacted resume-requeue event without resume content or request secrets', async () => {
    await service.write(transaction as never, {
      actorUserId: 'admin-1',
      targetType: 'resume',
      targetId: 'resume-1',
      action: 'admin.resume.requeue',
      correlationId: 'request_12345678',
      ipAddress: '192.0.2.1',
      userAgent: 'private-agent',
      before: {
        status: 'failed',
        failureCategory: 'provider_transient',
        parsedJson: { fullName: 'Private Candidate' },
        originalFileUrl: 's3://private/resume.pdf',
        proof: 'raw-proof',
      },
      after: {
        status: 'requeue_requested',
        reason: 'provider_recovered',
        token: 'raw-token',
        requestBody: { prompt: 'private' },
      },
    });

    const persisted = activityLog.create.mock.calls[0][0].data;
    expect(persisted).toEqual(
      expect.objectContaining({
        type: 'admin_resume_requeue',
        action: 'admin.resume.requeue',
        targetType: 'resume',
        targetId: 'resume-1',
        before: {
          status: 'failed',
          failureCategory: 'provider_transient',
        },
        after: {
          status: 'requeue_requested',
          reason: 'provider_recovered',
        },
        ipAddress: undefined,
        userAgent: undefined,
      }),
    );
    expect(JSON.stringify(persisted)).not.toMatch(
      /Private Candidate|s3:\/\/|raw-proof|raw-token|private-agent|192\.0\.2\.1|requestBody|prompt/i,
    );
  });

  it('fails closed for an unmapped action without writing an access-denied audit row', async () => {
    await expect(
      service.write(transaction as never, {
        actorUserId: 'admin-1',
        targetType: 'user',
        targetId: 'user-1',
        action: 'admin.user.unmapped',
        correlationId: 'request_12345678',
        before: {
          token: 'raw-token',
          requestBody: { proof: 'raw-proof' },
        },
      }),
    ).rejects.toEqual(
      new BadRequestException('Unsupported administrative audit action'),
    );
    expect(activityLog.create).not.toHaveBeenCalled();
  });

  it('uses one bounded projected query with stable pagination and safe filters', async () => {
    const latest = {
      id: 'event-2',
      createdAt: new Date('2026-09-21T02:00:00.000Z'),
      action: 'admin.user.suspend',
      actorUserId: 'admin-1',
      targetType: 'user',
      targetId: 'user-1',
      correlationId: 'request_12345678',
      metadata: { requestBody: { password: 'must-not-leak' } },
      ipAddress: '192.0.2.1',
      userAgent: 'private-agent/1.0',
      before: { status: 'active', requestBody: { password: 'must-not-leak' } },
      after: {
        status: 'suspended',
        suspendedAt: '2026-09-21T02:00:00.000Z',
        mfaSecret: 'must-not-leak',
      },
    };
    prisma.activityLog.findMany.mockResolvedValue([
      latest,
      { ...latest, id: 'event-1' },
    ]);

    const result = await service.listForAdmin({
      limit: 1,
      action: 'admin.user.suspend',
      actorUserId: 'admin-1',
      targetType: 'user',
      targetId: 'user-1',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-30T00:00:00.000Z',
    });

    expect(prisma.activityLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'admin.user.suspend',
        actorUserId: 'admin-1',
        targetType: 'user',
        targetId: 'user-1',
        createdAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lte: new Date('2026-09-30T00:00:00.000Z'),
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 2,
      select: {
        id: true,
        createdAt: true,
        actorUserId: true,
        targetType: true,
        targetId: true,
        action: true,
        correlationId: true,
        before: true,
        after: true,
      },
    });
    expect(result).toEqual({
      events: [{
        id: 'event-2',
        createdAt: '2026-09-21T02:00:00.000Z',
        action: 'admin.user.suspend',
        targetType: 'user',
        targetId: 'user-1',
        actorRef: 'admin-1',
        correlationId: 'request_12345678',
        before: { status: 'active' },
        after: {
          status: 'suspended',
          suspendedAt: '2026-09-21T02:00:00.000Z',
        },
      }],
      limit: 1,
      nextCursor: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toMatch(
      /must-not-leak|requestBody|mfaSecret|192\.0\.2\.1|private-agent|metadata/i,
    );
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('defaults to 20 rows and still bounds every read query', async () => {
    const result = await service.listForAdmin({});

    expect(result).toEqual({ events: [], limit: 20, nextCursor: null });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      select: expect.any(Object),
    });
  });

  it('uses the cursor only with the same stable order and clamps reads to 100 rows', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: '2026-09-21T02:00:00.000Z',
        id: 'event-2',
      }),
    ).toString('base64url');

    await service.listForAdmin({ cursor, limit: 1_000 });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 101,
      cursor: { id: 'event-2' },
      skip: 1,
      select: expect.any(Object),
    });
  });

  it('records exactly one safe trace event only after an authorized audit read succeeds', async () => {
    prisma.activityLog.findMany.mockResolvedValue([
      {
        id: 'event-existing',
        createdAt: new Date('2026-09-21T02:00:00.000Z'),
        actorUserId: 'admin-2',
        targetType: 'user',
        targetId: 'user-1',
        action: 'admin.user.suspend',
        correlationId: 'request_12345678',
        before: { status: 'active' },
        after: { status: 'suspended' },
      },
    ]);

    const result = await service.readForAdmin(
      { limit: 20 },
      { actorUserId: 'admin-1', correlationId: 'request_abcdefgh' },
    );

    expect(result.events).toEqual([
      expect.objectContaining({ action: 'admin.user.suspend' }),
    ]);
    expect(result.events).not.toContainEqual(
      expect.objectContaining({ action: 'admin.activity_log.read' }),
    );
    expect(prisma.activityLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'admin_activity_log_read',
        actorUserId: 'admin-1',
        targetType: 'activity_log',
        targetId: 'activity_log',
        action: 'admin.activity_log.read',
        correlationId: 'request_abcdefgh',
        ipAddress: undefined,
        userAgent: undefined,
        before: undefined,
        after: undefined,
      }),
    });
    expect(prisma.activityLog.create.mock.calls[0][0].data.type).not.toBe(
      'access_denied',
    );
    expect(service).not.toHaveProperty('stepUpMfa');
    expect(service).not.toHaveProperty('mutationExecutor');
  });

  it('creates separate non-recursive events without storing cursors or filter values', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: '2026-09-21T02:00:00.000Z',
        id: 'cursor-value',
      }),
    ).toString('base64url');
    const input = {
      cursor,
      action: 'admin.user.suspend',
      actorUserId: 'admin-private',
      targetType: 'user',
      targetId: 'private-target',
    };
    const context = {
      actorUserId: 'admin-1',
      correlationId: 'request_abcdefgh',
    };

    await service.readForAdmin(input, context);
    await service.readForAdmin(input, context);

    expect(prisma.activityLog.create).toHaveBeenCalledTimes(2);
    const persisted = JSON.stringify(prisma.activityLog.create.mock.calls);
    expect(persisted).not.toMatch(
      /cursor-value|admin\.user\.suspend|admin-private|private-target/i,
    );
    expect(persisted).not.toMatch(/proof|token|password|mfa|requestBody|metadata/i);
  });

  it('does not create a successful-read event when the bounded query fails', async () => {
    prisma.activityLog.findMany.mockRejectedValueOnce(new Error('database read failed'));

    await expect(
      service.readForAdmin({}, { actorUserId: 'admin-1' }),
    ).rejects.toThrow('database read failed');

    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('rejects malformed cursors, unsafe filters, invalid dates, and reversed date ranges', async () => {
    await expect(
      service.listForAdmin({ cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.listForAdmin({ action: 'admin user suspend' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.listForAdmin({ createdFrom: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.listForAdmin({
        createdFrom: '2026-09-22T00:00:00.000Z',
        createdTo: '2026-09-21T00:00:00.000Z',
      }),
    ).rejects.toThrow('Invalid activity-log date range');
    expect(prisma.activityLog.findMany).not.toHaveBeenCalled();
  });
});
