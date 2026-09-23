import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminMutationExecutor } from './admin-mutation.executor';

const context = {
  actorUserId: 'admin-1',
  sessionId: 'session-1',
  role: UserRole.platform_admin,
  mfaVerified: true,
  correlationId: 'request_12345678',
  ipAddress: '127.0.0.1',
  userAgent: 'ApplyAI-Test/1.0',
};

describe('AdminMutationExecutor', () => {
  const transaction = { id: 'transaction-1' };
  const stepUpMfa = { consume: jest.fn() };
  const audit = { write: jest.fn() };
  let committed: boolean;
  const prisma = {
    $transaction: jest.fn(async (operation) => {
      const result = await operation(transaction);
      committed = true;
      return result;
    }),
  };
  let executor: AdminMutationExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    committed = false;
    stepUpMfa.consume.mockResolvedValue(undefined);
    audit.write.mockResolvedValue(undefined);
    executor = new AdminMutationExecutor(
      prisma as never,
      stepUpMfa as never,
      audit as never,
    );
  });

  function execute(command: jest.Mock = jest.fn().mockResolvedValue({
    value: { status: 'suspended' },
    before: { status: 'active' },
    after: { status: 'suspended' },
  })) {
    return {
      result: executor.execute({
        context,
        proof: 'a'.repeat(43),
        action: 'admin.user.suspend',
        targetType: 'user',
        targetId: 'user-1',
        command,
      }),
      command,
    };
  }

  it('commits proof consumption, domain mutation, and exactly one audit together', async () => {
    const { result, command } = execute();

    await expect(result).resolves.toEqual({ status: 'suspended' });

    expect(stepUpMfa.consume).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'admin-1', targetId: 'user-1' }),
      'a'.repeat(43),
      transaction,
    );
    expect(command).toHaveBeenCalledWith(transaction);
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        actorUserId: 'admin-1',
        before: { status: 'active' },
        after: { status: 'suspended' },
      }),
    );
    expect(committed).toBe(true);
  });

  it('rolls back proof consumption and skips audit when the domain fails', async () => {
    const domainError = new Error('domain policy rejected mutation');
    const { result } = execute(jest.fn().mockRejectedValue(domainError));

    await expect(result).rejects.toBe(domainError);

    expect(audit.write).not.toHaveBeenCalled();
    expect(committed).toBe(false);
  });

  it('rolls back the domain mutation when audit persistence fails', async () => {
    const auditError = new Error('audit unavailable');
    audit.write.mockRejectedValue(auditError);
    const { result, command } = execute();

    await expect(result).rejects.toBe(auditError);

    expect(command).toHaveBeenCalledWith(transaction);
    expect(committed).toBe(false);
  });

  it('rolls back the mutation when the audit boundary rejects an unmapped action', async () => {
    const auditError = new BadRequestException(
      'Unsupported administrative audit action',
    );
    audit.write.mockRejectedValue(auditError);
    const { result, command } = execute();

    await expect(result).rejects.toBe(auditError);
    expect(command).toHaveBeenCalledWith(transaction);
    expect(committed).toBe(false);
  });

  it('rejects replayed proof before invoking the domain or audit', async () => {
    stepUpMfa.consume.mockRejectedValue(
      new UnauthorizedException('Step-up proof is invalid'),
    );
    const { result, command } = execute();

    await expect(result).rejects.toThrow('Step-up proof is invalid');

    expect(command).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
    expect(committed).toBe(false);
  });
});
