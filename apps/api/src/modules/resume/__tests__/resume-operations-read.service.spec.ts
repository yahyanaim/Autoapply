import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResumeOperationsReadService } from '../application/resume-operations-read.service';

describe('ResumeOperationsReadService', () => {
  const prisma = { resume: { findMany: jest.fn(), findFirst: jest.fn() } };
  const service = new ResumeOperationsReadService(prisma as never);
  const row = {
    id: 'ckz8dc7m40000qwertyuiop12',
    parseStatus: 'failed',
    mimeType: 'application/pdf',
    createdAt: new Date('2026-09-23T00:00:00.000Z'),
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    _count: { parseExecutionClaims: 2 },
    parseExecutionClaims: [{ attempt: 2, claimedAt: new Date('2026-09-24T00:00:00.000Z') }],
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns a bounded sanitized failure projection with no resume content', async () => {
    prisma.resume.findMany.mockResolvedValue([row]);
    const result = await service.listFailures({ limit: 20 });
    expect(result.failures[0]).toEqual(expect.objectContaining({ resumeId: row.id, executionCount: 2, lastAttempt: 2 }));
    expect(prisma.resume.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21, where: { parseStatus: 'failed' }, select: expect.not.objectContaining({ parsedJson: true, originalFileUrl: true, parseError: true, userId: true }) }));
    expect(JSON.stringify(result)).not.toMatch(/parsedJson|originalFileUrl|parseError|userId|prompt|token|provider/i);
  });

  it('returns safe detail and rejects missing failures', async () => {
    prisma.resume.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    await expect(service.getFailure(row.id)).resolves.toEqual(expect.objectContaining({ resumeId: row.id }));
    await expect(service.getFailure(row.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects malformed cursors without a query', async () => {
    await expect(service.listFailures({ cursor: 'bad' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.resume.findMany).not.toHaveBeenCalled();
  });
});
