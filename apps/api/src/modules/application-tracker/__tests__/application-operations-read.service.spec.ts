import { BadRequestException } from '@nestjs/common';
import { ApplicationOperationsReadService } from '../application/application-operations-read.service';

describe('ApplicationOperationsReadService', () => {
  const prisma = { application: { groupBy: jest.fn() } };
  const now = new Date('2026-09-24T12:00:00.000Z');
  const service = new ApplicationOperationsReadService(prisma as never, { now: () => now } as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns only non-attributable aggregate application volumes', async () => {
    prisma.application.groupBy.mockResolvedValue([{ status: 'submitted', _count: { _all: 4 } }]);
    const result = await service.getAggregate({});
    expect(result.total).toBe(4);
    expect(result.byStatus.submitted).toBe(4);
    expect(prisma.application.groupBy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/userId|email|resume|cv|prompt|document|nori|token|payment/i);
  });

  it('rejects reversed and unbounded date ranges', async () => {
    await expect(service.getAggregate({ createdFrom: '2026-09-24T00:00:00.000Z', createdTo: '2026-09-23T00:00:00.000Z' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getAggregate({ createdFrom: '2020-01-01T00:00:00.000Z', createdTo: '2026-09-23T00:00:00.000Z' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
