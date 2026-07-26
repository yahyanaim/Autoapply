import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../interface/guards/roles.guard';

describe('RolesGuard MFA enforcement', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  function context(user: Record<string, unknown>) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as never;
  }

  beforeEach(() => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.org_admin,
      UserRole.platform_admin,
    ]);
  });

  it('rejects a privileged role whose session did not verify MFA', () => {
    expect(
      guard.canActivate(
        context({ role: UserRole.platform_admin, mfaVerified: false }),
      ),
    ).toBe(false);
  });

  it('permits a privileged role only after session MFA verification', () => {
    expect(
      guard.canActivate(
        context({ role: UserRole.platform_admin, mfaVerified: true }),
      ),
    ).toBe(true);
  });
});
