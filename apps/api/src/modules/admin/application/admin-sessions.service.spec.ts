import { BadRequestException, ConflictException } from '@nestjs/common';
import { SessionClientType } from '@prisma/client';
import { AdminSessionsService } from './admin-sessions.service';
import { UserRole } from '@prisma/client';

describe('AdminSessionsService', () => {
  const transaction = { id: 'transaction-1' };
  const auth = {
    listAdminSessions: jest.fn(),
    revokeAdminSessionInTransaction: jest.fn(),
    revokeAdminOtherSessionsInTransaction: jest.fn(),
  };
  const mutations = { execute: jest.fn() };
  let service: AdminSessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.listAdminSessions.mockResolvedValue([]);
    auth.revokeAdminSessionInTransaction.mockResolvedValue({
      value: { userId: 'user-1', sessionId: '7d397356-f8f8-4f8e-9dce-5571bb1e24e0', status: 'revoked' },
      before: { enabled: true },
      after: { enabled: false },
    });
    auth.revokeAdminOtherSessionsInTransaction.mockResolvedValue({
      value: { userId: 'user-1', revokedSessionCount: 2 },
      before: { enabled: true },
      after: { enabled: false },
    });
    mutations.execute.mockImplementation(async (input) => {
      const mutation = await input.command(transaction);
      return mutation.value;
    });
    service = new AdminSessionsService(auth as never, mutations as never);
  });

  it('uses one bounded Auth-owned query with safe filters', async () => {
    await service.list({
      currentSessionId: 'session-current',
      limit: 1_000,
      clientType: SessionClientType.web,
      status: 'active',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-30T23:59:59.000Z',
      lastUsedFrom: '2026-09-10T00:00:00.000Z',
      lastUsedTo: '2026-09-21T23:59:59.000Z',
    });

    expect(auth.listAdminSessions).toHaveBeenCalledTimes(1);
    expect(auth.listAdminSessions).toHaveBeenCalledWith({
      limit: 100,
      clientType: SessionClientType.web,
      status: 'active',
      createdFrom: new Date('2026-09-01T00:00:00.000Z'),
      createdTo: new Date('2026-09-30T23:59:59.000Z'),
      lastUsedFrom: new Date('2026-09-10T00:00:00.000Z'),
      lastUsedTo: new Date('2026-09-21T23:59:59.000Z'),
    });
  });

  it('returns a sanitized page, current marker, and stable cursor', async () => {
    const first = {
      userId: 'user-1',
      id: 'session-2',
      clientType: SessionClientType.extension,
      createdAt: new Date('2026-09-21T02:00:00.000Z'),
      lastUsedAt: new Date('2026-09-21T02:05:00.000Z'),
      expiresAt: new Date('2026-09-28T02:00:00.000Z'),
      token: 'must-not-leak',
      ipAddress: '192.0.2.1',
      mfaVerifiedAt: new Date(),
    };
    auth.listAdminSessions.mockResolvedValue([
      first,
      { ...first, id: 'session-1' },
    ]);

    const result = await service.list({
      currentSessionId: 'session-2',
      limit: 1,
    });

    expect(result.sessions).toEqual([{
      userId: 'user-1',
      sessionId: 'session-2',
      clientType: SessionClientType.extension,
      createdAt: '2026-09-21T02:00:00.000Z',
      lastUsedAt: '2026-09-21T02:05:00.000Z',
      expiresAt: '2026-09-28T02:00:00.000Z',
      current: true,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|192\.0\.2\.1|mfaVerifiedAt/);
    expect(result.nextCursor).toEqual(expect.any(String));

    await service.list({ cursor: result.nextCursor!, limit: 1 });
    expect(auth.listAdminSessions).toHaveBeenLastCalledWith({
      limit: 1,
      cursor: {
        createdAt: new Date('2026-09-21T02:00:00.000Z'),
        id: 'session-2',
      },
    });
  });

  it('accepts a first page without a cursor and rejects malformed cursors or ranges', async () => {
    await expect(service.list({})).resolves.toBeDefined();
    await expect(service.list({ cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const incompleteCursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-09-21T00:00:00.000Z' }),
    ).toString('base64url');
    await expect(service.list({ cursor: incompleteCursor })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.list({
        createdFrom: '2026-09-22T00:00:00.000Z',
        createdTo: '2026-09-21T00:00:00.000Z',
      }),
    ).rejects.toThrow('Invalid created date range');
  });

  it('binds single-session revocation to the executor transaction and Auth ownership command', async () => {
    const context = {
      actorUserId: 'admin-1',
      sessionId: 'admin-session-1',
      role: UserRole.platform_admin,
      mfaVerified: true,
      correlationId: 'request_12345678',
    };
    const targetSessionId = '7d397356-f8f8-4f8e-9dce-5571bb1e24e0';

    await expect(service.revoke({
      context,
      targetUserId: 'user-1',
      targetSessionId,
      stepUpProof: 'a'.repeat(43),
    })).resolves.toEqual({ userId: 'user-1', sessionId: targetSessionId, status: 'revoked' });

    expect(mutations.execute).toHaveBeenCalledWith(expect.objectContaining({
      context,
      proof: 'a'.repeat(43),
      action: 'admin.session.revoke',
      targetType: 'session',
      targetId: targetSessionId,
      command: expect.any(Function),
    }));
    expect(auth.revokeAdminSessionInTransaction).toHaveBeenCalledWith(
      transaction,
      'user-1',
      targetSessionId,
    );
    expect(service).not.toHaveProperty('prisma');
  });

  it('rejects revocation of the authenticated administrator current session inside the executor transaction', async () => {
    const currentSessionId = '7d397356-f8f8-4f8e-9dce-5571bb1e24e0';
    const context = {
      actorUserId: 'admin-1',
      sessionId: currentSessionId,
      role: UserRole.platform_admin,
      mfaVerified: true,
      correlationId: 'request_12345678',
    };

    await expect(service.revoke({
      context,
      targetUserId: 'admin-1',
      targetSessionId: currentSessionId,
      stepUpProof: 'a'.repeat(43),
    })).rejects.toEqual(
      new ConflictException('admin.session.current_revoke_forbidden'),
    );

    expect(auth.revokeAdminSessionInTransaction).not.toHaveBeenCalled();
    expect(mutations.execute).toHaveBeenCalledWith(expect.objectContaining({
      proof: 'a'.repeat(43),
      action: 'admin.session.revoke',
    }));
  });

  it('still allows a different session owned by the authenticated administrator', async () => {
    const context = {
      actorUserId: 'admin-1',
      sessionId: '7d397356-f8f8-4f8e-9dce-5571bb1e24e0',
      role: UserRole.platform_admin,
      mfaVerified: true,
      correlationId: 'request_12345678',
    };
    const otherSessionId = '6d397356-f8f8-4f8e-9dce-5571bb1e24e0';
    auth.revokeAdminSessionInTransaction.mockResolvedValueOnce({
      value: { userId: 'admin-1', sessionId: otherSessionId, status: 'revoked' },
      before: { enabled: true },
      after: { enabled: false },
    });

    await expect(service.revoke({
      context,
      targetUserId: 'admin-1',
      targetSessionId: otherSessionId,
      stepUpProof: 'b'.repeat(43),
    })).resolves.toEqual({ userId: 'admin-1', sessionId: otherSessionId, status: 'revoked' });
    expect(auth.revokeAdminSessionInTransaction).toHaveBeenCalledWith(
      transaction,
      'admin-1',
      otherSessionId,
    );
  });

  it('revokes every other same-user session while preserving the authenticated session', async () => {
    const context = {
      actorUserId: 'admin-1',
      sessionId: 'current-session',
      role: UserRole.platform_admin,
      mfaVerified: true,
      correlationId: 'request_12345678',
    };

    await expect(service.revokeAll({
      context,
      targetUserId: 'admin-1',
      stepUpProof: 'c'.repeat(43),
    })).resolves.toEqual({ userId: 'user-1', revokedSessionCount: 2 });

    expect(mutations.execute).toHaveBeenCalledWith(expect.objectContaining({
      context,
      proof: 'c'.repeat(43),
      action: 'admin.session.revoke_all',
      targetType: 'user',
      targetId: 'admin-1',
      command: expect.any(Function),
    }));
    expect(auth.revokeAdminOtherSessionsInTransaction).toHaveBeenCalledWith(
      transaction,
      'admin-1',
      'current-session',
    );
    expect(service).not.toHaveProperty('prisma');
  });

  it('revokes all sessions for another user and preserves a deterministic zero count', async () => {
    const context = {
      actorUserId: 'admin-1',
      sessionId: 'current-session',
      role: UserRole.platform_admin,
      mfaVerified: true,
      correlationId: 'request_12345678',
    };
    auth.revokeAdminOtherSessionsInTransaction.mockResolvedValueOnce({
      value: { userId: 'user-2', revokedSessionCount: 0 },
      before: { enabled: true },
      after: { enabled: false },
    });

    await expect(service.revokeAll({
      context,
      targetUserId: 'user-2',
      stepUpProof: 'd'.repeat(43),
    })).resolves.toEqual({ userId: 'user-2', revokedSessionCount: 0 });
    expect(auth.revokeAdminOtherSessionsInTransaction).toHaveBeenCalledWith(
      transaction,
      'user-2',
      undefined,
    );
  });
});
