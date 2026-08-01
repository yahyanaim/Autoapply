import { BadRequestException } from '@nestjs/common';
import { AIController } from '../../modules/ai/interface/ai.controller';
import { ApplicationTrackerController } from '../../modules/application-tracker/interface/application-tracker.controller';
import { ResumeController } from '../../modules/resume/interface/resume.controller';

const USER_ID = 'user-contract';
const VALID_KEY = 'contract-key-0001';

describe('costly mutation idempotency controller contracts', () => {
  const aiService = {
    optimizeResume: jest.fn(),
    generateCoverLetter: jest.fn(),
  };
  const trackerService = {
    create: jest.fn(),
    prepare: jest.fn(),
    regenerate: jest.fn(),
  };
  const idempotency = {
    execute: jest.fn(async (input: { handler: () => Promise<unknown> }) =>
      input.handler(),
    ),
  };

  const aiController = new AIController(
    aiService as never,
    idempotency as never,
  );
  const resumeController = new ResumeController(
    {} as never,
    aiService as never,
    {} as never,
    idempotency as never,
  );
  const applicationController = new ApplicationTrackerController(
    trackerService as never,
    idempotency as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    aiService.optimizeResume.mockResolvedValue({ id: 'version-1' });
    aiService.generateCoverLetter.mockResolvedValue({ id: 'letter-1' });
    trackerService.regenerate.mockResolvedValue({ id: 'application-1' });
    trackerService.create.mockResolvedValue({ id: 'application-1' });
    trackerService.prepare.mockResolvedValue({ id: 'application-1' });
  });

  it.each([
    [
      'AI optimization',
      () =>
        aiController.optimize(
          USER_ID,
          {
            resumeId: 'cresume001',
            jobId: 'cjob000001',
          },
          undefined,
        ),
    ],
    [
      'cover letter generation',
      () =>
        aiController.coverLetter(
          USER_ID,
          {
            resumeId: 'cresume001',
            jobId: 'cjob000001',
            tone: 'professional',
          },
          undefined,
        ),
    ],
    [
      'stored resume optimization',
      () =>
        resumeController.optimize(
          USER_ID,
          'cresume001',
          {
            jobId: 'cjob000001',
          },
          undefined,
        ),
    ],
    [
      'application regeneration',
      () =>
        applicationController.regenerate(
          USER_ID,
          'application-1',
          {
            target: 'all' as never,
          },
          undefined,
        ),
    ],
    [
      'application creation',
      () =>
        applicationController.create(
          USER_ID,
          {
            jobId: 'job-1',
            resumeVersionId: 'version-1',
            coverLetterId: 'letter-1',
          },
          undefined,
        ),
    ],
    [
      'application preparation',
      () =>
        applicationController.prepare(
          USER_ID,
          {
            jobId: 'job-1',
            resumeId: 'resume-1',
          },
          undefined,
        ),
    ],
  ])(
    'rejects a missing Idempotency-Key before starting %s',
    async (_name, invoke) => {
      await expect(invoke()).rejects.toBeInstanceOf(BadRequestException);
      expect(idempotency.execute).not.toHaveBeenCalled();
      expect(aiService.optimizeResume).not.toHaveBeenCalled();
      expect(aiService.generateCoverLetter).not.toHaveBeenCalled();
      expect(trackerService.regenerate).not.toHaveBeenCalled();
      expect(trackerService.create).not.toHaveBeenCalled();
      expect(trackerService.prepare).not.toHaveBeenCalled();
    },
  );

  it('wires direct AI optimization through its idempotent operation', async () => {
    const body = { resumeId: 'cresume001', jobId: 'cjob000001' };

    await expect(
      aiController.optimize(USER_ID, body, VALID_KEY),
    ).resolves.toEqual({ id: 'version-1' });

    expect(idempotency.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      key: VALID_KEY,
      operation: 'ai.optimize',
      payload: body,
      handler: expect.any(Function),
    });
    expect(aiService.optimizeResume).toHaveBeenCalledWith(
      USER_ID,
      body.resumeId,
      body.jobId,
    );
  });

  it('wires cover-letter generation through its idempotent operation', async () => {
    const body = {
      resumeId: 'cresume001',
      jobId: 'cjob000001',
      tone: 'professional',
    };

    await expect(
      aiController.coverLetter(USER_ID, body, VALID_KEY),
    ).resolves.toEqual({ id: 'letter-1' });

    expect(idempotency.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      key: VALID_KEY,
      operation: 'ai.cover-letter',
      payload: body,
      handler: expect.any(Function),
    });
    expect(aiService.generateCoverLetter).toHaveBeenCalledWith(
      USER_ID,
      body.jobId,
      body.resumeId,
      body.tone,
    );
  });

  it('wires stored-resume optimization through its idempotent operation', async () => {
    await expect(
      resumeController.optimize(
        USER_ID,
        'cresume001',
        { jobId: 'cjob000001' },
        VALID_KEY,
      ),
    ).resolves.toEqual({ id: 'version-1' });

    expect(idempotency.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      key: VALID_KEY,
      operation: 'resumes.optimize',
      payload: { resumeId: 'cresume001', jobId: 'cjob000001' },
      handler: expect.any(Function),
    });
  });

  it('wires application regeneration through its idempotent operation', async () => {
    await expect(
      applicationController.regenerate(
        USER_ID,
        'application-1',
        { target: 'all' as never },
        VALID_KEY,
      ),
    ).resolves.toEqual({ id: 'application-1' });

    expect(idempotency.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      key: VALID_KEY,
      operation: 'applications.regenerate',
      payload: { applicationId: 'application-1', target: 'all' },
      handler: expect.any(Function),
    });
    expect(trackerService.regenerate).toHaveBeenCalledWith(
      USER_ID,
      'application-1',
      'all',
    );
  });

  it('passes a validated key to application creation', async () => {
    await applicationController.create(
      USER_ID,
      {
        jobId: 'job-1',
        resumeVersionId: 'version-1',
        coverLetterId: 'letter-1',
      },
      VALID_KEY,
    );

    expect(trackerService.create).toHaveBeenCalledWith(
      USER_ID,
      'job-1',
      'version-1',
      'letter-1',
      VALID_KEY,
    );
  });

  it('passes a validated key to unified application preparation', async () => {
    await applicationController.prepare(
      USER_ID,
      { jobId: 'job-1', resumeId: 'resume-1' },
      VALID_KEY,
    );

    expect(trackerService.prepare).toHaveBeenCalledWith(
      USER_ID,
      'job-1',
      'resume-1',
      VALID_KEY,
    );
  });
});
