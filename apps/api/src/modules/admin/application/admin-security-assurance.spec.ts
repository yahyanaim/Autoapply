import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminStepUpMfaService } from './admin-step-up-mfa.service';
import { AdminController } from '../interface/admin.controller';
import { AdminConsoleEnabledGuard } from '../interface/guards/admin-console-enabled.guard';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';

const binding = {
  actorUserId: 'admin-1',
  sessionId: 'session-1',
  action: 'admin.user.suspend',
  targetType: 'user',
  targetId: 'user-1',
};

describe('Admin Console security assurance', () => {
  it.each([
    ['false', false],
    ['unset', undefined],
  ])('denies console access when ADMIN_CONSOLE_ENABLED is %s', (_name, value) => {
    const config = { get: jest.fn().mockReturnValue(value) };
    const guard = new AdminConsoleEnabledGuard(config as never);

    expect(() => guard.canActivate({} as never)).toThrow(ForbiddenException);
    expect(config.get).toHaveBeenCalledWith('ADMIN_CONSOLE_ENABLED', false);
  });

  it('leaves legacy /admin guards and path unchanged', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminController)).toBe('admin');
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminController,
    ) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    expect(guards).not.toContain(AdminConsoleEnabledGuard);
  });

  it('rejects missing, malformed, and mismatched step-up proofs', async () => {
    const proofStore = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const prisma = { adminStepUpMfaProof: proofStore };
    const service = new AdminStepUpMfaService(
      prisma as never,
      {} as never,
      { now: () => new Date('2026-09-21T00:00:00.000Z') } as never,
    );

    await expect(service.consume(binding, '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.consume(binding, 'not-a-proof')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.consume(binding, 'a'.repeat(43)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(proofStore.updateMany).toHaveBeenCalledTimes(1);
  });
});
