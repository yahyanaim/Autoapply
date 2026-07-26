import { ResumeParseWorker } from '../infrastructure/queue/resume-parse.worker';

describe('ResumeParseWorker dead-letter routing', () => {
  it('routes a terminal job once with inspectable failure metadata', async () => {
    const deadLetterQueue = {
      add: jest.fn().mockResolvedValue({ id: 'dlq_1' }),
    };
    const worker = new ResumeParseWorker(
      { get: jest.fn() } as never,
      {} as never,
      { close: jest.fn() } as never,
      deadLetterQueue as never,
      { activityLog: { create: jest.fn() } } as never,
    );
    const job = {
      id: 'resume-parse-r1',
      data: { resumeId: 'r1', userId: 'u1' },
      attemptsMade: 3,
      opts: { attempts: 3 },
    };

    await worker.routeToDeadLetter(job as never, new Error('provider timeout'));

    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      'failed-resume-parse',
      expect.objectContaining({
        originalJobId: 'resume-parse-r1',
        originalQueue: 'resume-parse',
        originalData: { resumeId: 'r1', userId: 'u1' },
        attemptsMade: 3,
        failedReason: 'provider timeout',
      }),
      expect.objectContaining({
        jobId: 'resume-parse-dlq-resume-parse-r1',
        removeOnComplete: false,
        removeOnFail: false,
      }),
    );
  });
});
