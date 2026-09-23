import { AdminOverviewService } from './admin-overview.service';

describe('AdminOverviewService', () => {
  const auth = { countSuspendedUsersForAdmin: jest.fn() };
  let service: AdminOverviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.countSuspendedUsersForAdmin.mockResolvedValue(3);
    service = new AdminOverviewService(auth as never);
  });

  it.each([3, 0])('delegates the suspended-user aggregate to Auth and returns only the safe count (%s)', async (count) => {
    auth.countSuspendedUsersForAdmin.mockResolvedValue(count);

    const result = await service.getOverview();
    expect(result).toEqual({
      suspendedUserCount: count,
    });

    expect(auth.countSuspendedUsersForAdmin).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(
      /incident|email|session|token|hash|mfa|ip|userAgent|password|cv|resume|prompt|payment|metadata/i,
    );
  });
});
