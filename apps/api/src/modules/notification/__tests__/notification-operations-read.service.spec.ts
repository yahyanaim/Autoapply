import { BadRequestException } from '@nestjs/common';
import { NotificationOperationsReadService } from '../application/notification-operations-read.service';

describe('NotificationOperationsReadService', () => {
  const prisma = { notification: { groupBy: jest.fn(), findMany: jest.fn() } };
  const now = new Date('2026-09-24T12:00:00.000Z');
  const service = new NotificationOperationsReadService(prisma as never, { now: () => now } as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns bounded counts and failures without bodies, users, or provider data', async () => {
    prisma.notification.groupBy.mockResolvedValue([{ status: 'failed', _count: { _all: 2 } }, { status: 'sent', _count: { _all: 3 } }]);
    prisma.notification.findMany.mockResolvedValue([{ id: 'n1', channel: 'email', status: 'failed', createdAt: now, sentAt: null }]);
    const result = await service.getDeliverySummary({ limit: 20 });
    expect(result.rollup).toEqual({ total: 5, pending: 0, sent: 3, failed: 2, read: 0 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21, select: { id: true, channel: true, status: true, createdAt: true, sentAt: true } }));
    for (const field of ['body', 'title', 'userId', 'recipient', 'token', 'provider', 'secret']) {
      expect(result.failures[0]).not.toHaveProperty(field);
    }
  });

  it('rejects reversed and unbounded date ranges', async () => {
    await expect(service.getDeliverySummary({ createdFrom: '2026-09-24T00:00:00.000Z', createdTo: '2026-09-23T00:00:00.000Z' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getDeliverySummary({ createdFrom: '2026-01-01T00:00:00.000Z', createdTo: '2026-09-23T00:00:00.000Z' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
