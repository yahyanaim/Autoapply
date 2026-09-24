import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AIRequestFeature, JobStatus } from '@prisma/client';
import { AIService } from '../application/ai.service';
import { calculateMatchScore } from '../domain/match-score';

describe('AIService resume ownership and readiness', () => {
  const prisma = {
    resume: { findFirst: jest.fn() },
    job: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    resumeVersion: { create: jest.fn() },
    coverLetter: { create: jest.fn() },
    usageLimit: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const matchScoreCache = {
    score: jest.fn(
      async (
        _resumeId: string,
        resumeContent: string,
        jobDescription: string,
      ) => ({
        ...calculateMatchScore({ content: resumeContent }, jobDescription),
        cached: false,
      }),
    ),
  };
  const service = new AIService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    matchScoreCache as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      email: 'candidate@example.com',
      profile: { fullName: 'Candidate Name' },
    });
    prisma.usageLimit.findUnique.mockResolvedValue({
      resumeOptimizationsUsed: 0,
      resumeOptimizationsMax: 1,
      resetAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.usageLimit.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
  });

  it('scores only an owned, fully parsed resume', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: { skills: ['TypeScript', 'React'] },
    });
    prisma.job.findFirst.mockResolvedValue({
      id: 'job_1',
      description: 'TypeScript and React are required.',
    });

    await expect(
      service.matchScore('user_1', 'resume_1', 'job_1'),
    ).resolves.toEqual(expect.objectContaining({ score: expect.any(Number) }));
    expect(prisma.resume.findFirst).toHaveBeenCalledWith({
      where: { id: 'resume_1', userId: 'user_1' },
    });
    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'job_1',
        OR: [
          {
            status: JobStatus.active,
            capturedByUserId: null,
            scrapedAt: { gte: expect.any(Date) },
          },
          { capturedByUserId: 'user_1', status: JobStatus.active },
        ],
      },
    });
  });

  it('rejects a resume that is still parsing', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'processing',
      parsedJson: null,
    });

    await expect(
      service.matchScoreText('user_1', 'resume_1', 'job text'),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not reveal whether another user owns a resume', async () => {
    prisma.resume.findFirst.mockResolvedValue(null);

    await expect(
      service.matchScoreText('user_1', 'other_resume', 'job text'),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not persist an optimization that adds a fabricated skill', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: {
        skills: ['TypeScript'],
        experience: [],
        education: [],
        projects: [],
        languages: [],
        certifications: [],
      },
    });
    prisma.job.findFirst.mockResolvedValue({
      id: 'job_1',
      description: 'Rust',
    });
    jest.spyOn(service, 'complete').mockResolvedValue({
      content: JSON.stringify({
        profileSummary: 'TypeScript developer.',
        experience: [],
        projects: [],
        skillsOrder: ['TypeScript', 'Rust'],
      }),
      model: 'test-model',
    });

    await expect(
      service.optimizeResume('user_1', 'resume_1', 'job_1'),
    ).rejects.toThrow(BadGatewayException);
    expect(prisma.resumeVersion.create).not.toHaveBeenCalled();
    expect(prisma.usageLimit.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        resetAt: new Date('2026-08-01T00:00:00.000Z'),
        resumeOptimizationsUsed: { gt: 0 },
      },
      data: { resumeOptimizationsUsed: { decrement: 1 } },
    });
  });

  it('enforces the monthly resume-optimization allowance atomically', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: { skills: ['TypeScript'] },
    });
    prisma.job.findFirst.mockResolvedValue({
      id: 'job_1',
      description: 'TypeScript',
    });
    prisma.usageLimit.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.optimizeResume('user_1', 'resume_1', 'job_1'),
    ).rejects.toThrow('Monthly resume-optimization limit reached');
    expect(service.complete).not.toHaveBeenCalled();
  });

  it('rejects a malformed optimization response', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: {
        skills: ['TypeScript'],
        experience: [],
        education: [],
        projects: [],
        languages: [],
        certifications: [],
      },
    });
    prisma.job.findFirst.mockResolvedValue({
      id: 'job_1',
      description: 'TypeScript',
    });
    jest.spyOn(service, 'complete').mockResolvedValue({
      content: '{"wrongField":true}',
      model: 'test-model',
    });

    await expect(
      service.optimizeResume('user_1', 'resume_1', 'job_1'),
    ).rejects.toThrow('invalid resume optimization');
    expect(prisma.resumeVersion.create).not.toHaveBeenCalled();
  });

  it('stores a validated generated CV document with the optimized version', async () => {
    const parsedResume = {
      skills: ['TypeScript', 'React'],
      experience: [
        {
          title: 'Software Engineer',
          company: 'Acme',
          startDate: '2022',
          endDate: 'Present',
          description: 'Built web applications.',
          highlights: ['Built customer features'],
        },
      ],
      education: [],
      projects: [],
      languages: ['English'],
      certifications: [],
    };
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: parsedResume,
    });
    prisma.job.findFirst.mockResolvedValue({
      id: 'job_1',
      description: 'TypeScript and React',
    });
    prisma.resumeVersion.create.mockResolvedValue({ id: 'version_1' });
    jest.spyOn(service, 'complete').mockResolvedValue({
      content: JSON.stringify({
        profileSummary:
          'Software Engineer experienced in TypeScript and React.',
        experience: [
          {
            index: 0,
            description: 'Built TypeScript web applications with React.',
            highlights: ['Built customer features with TypeScript and React'],
          },
        ],
        projects: [],
        skillsOrder: ['TypeScript', 'React'],
      }),
      model: 'test-model',
    });

    const result = await service.optimizeResume('user_1', 'resume_1', 'job_1');

    expect(result).toEqual(
      expect.objectContaining({
        versionId: 'version_1',
        truthfulness: expect.objectContaining({
          status: expect.stringMatching(/passed|review_required/),
          summary: expect.objectContaining({
            unsupported_blocked: 0,
          }),
        }),
        document: expect.objectContaining({
          template: 'classic-ats-v1',
          contact: expect.objectContaining({ fullName: 'Candidate Name' }),
        }),
      }),
    );
    expect(prisma.resumeVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentJson: expect.objectContaining({ template: 'classic-ats-v1' }),
        matchScore: calculateMatchScore(
          { content: JSON.stringify(parsedResume) },
          'TypeScript and React',
        ).score,
      }),
    });
  });

  it('does not persist a cover letter with a metric absent from the verified CV', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: {
        skills: ['TypeScript'],
        experience: [
          {
            title: 'Software Engineer',
            company: 'Acme',
            startDate: '2022',
            endDate: 'Present',
            description: 'Built customer features.',
            highlights: [],
          },
        ],
        education: [],
        projects: [],
        languages: [],
        certifications: [],
      },
    });
    prisma.job.findFirst.mockResolvedValue({
      id: 'job_1',
      description: 'Build TypeScript services for a Casablanca team.',
    });
    jest.spyOn(service, 'complete').mockResolvedValue({
      content: JSON.stringify({
        coverLetter:
          'Dear Acme hiring team, I built TypeScript customer features and increased conversion by 47% while working in Casablanca. I would bring that same practical focus to this role.',
      }),
      model: 'test-model',
    });

    await expect(
      service.generateCoverLetter('user_1', 'job_1', 'resume_1'),
    ).rejects.toThrow('47%');
    expect(prisma.coverLetter.create).not.toHaveBeenCalled();
  });
});

describe('AIService request budgets', () => {
  it('rejects oversized prompts before reserving quota or calling a provider', async () => {
    const prisma: any = {
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const provider = { complete: jest.fn() };
    const providerFactory = {
      create: jest.fn().mockReturnValue(provider),
      getMaxInputBytes: jest.fn().mockReturnValue(64),
      getMaxOutputTokens: jest.fn().mockReturnValue(2_048),
      getMaxRequestCost: jest.fn().mockReturnValue(0.5),
      getInputCostPerMillion: jest.fn().mockReturnValue(0.15),
      getOutputCostPerMillion: jest.fn().mockReturnValue(0.6),
      getProviderName: jest.fn().mockReturnValue('openai'),
    };
    const planAwareRouter = {
      resolve: jest.fn().mockResolvedValue({
        boundary: 'paid',
        maxInputBytes: 64,
        maxOutputTokens: 2_048,
        maxRequestCostUsd: 0.5,
      }),
    };
    prisma.user.findFirst.mockResolvedValue({ id: 'user_1' });
    const promptService = {
      loadTemplate: jest.fn().mockReturnValue('System\n## Resume\n{{resume}}'),
    };
    const service = new AIService(
      prisma as never,
      providerFactory as never,
      planAwareRouter as never,
      promptService as never,
      {} as never,
    );

    await expect(
      service.complete(AIRequestFeature.resume_optimize, 'user_1', {
        resume: 'a'.repeat(100),
      }),
    ).rejects.toThrow(PayloadTooLargeException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('rejects a request whose conservative projected cost exceeds the ceiling', async () => {
    const providerFactory = {
      create: jest.fn().mockReturnValue({ complete: jest.fn() }),
      getMaxInputBytes: jest.fn().mockReturnValue(100_000),
      getMaxOutputTokens: jest.fn().mockReturnValue(4_096),
      getMaxRequestCost: jest.fn().mockReturnValue(0.001),
      getInputCostPerMillion: jest.fn().mockReturnValue(10),
      getOutputCostPerMillion: jest.fn().mockReturnValue(30),
      getProviderName: jest.fn().mockReturnValue('openai'),
    };
    const planAwareRouter = {
      resolve: jest.fn().mockResolvedValue({
        boundary: 'paid',
        maxInputBytes: 100_000,
        maxOutputTokens: 4_096,
        maxRequestCostUsd: 0.001,
      }),
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user_1' }) },
      $transaction: jest.fn(),
    };
    const service = new AIService(
      prisma as never,
      providerFactory as never,
      planAwareRouter as never,
      {
        loadTemplate: jest
          .fn()
          .mockReturnValue('System\n## Resume\n{{resume}}'),
      } as never,
      {} as never,
    );

    await expect(
      service.complete(AIRequestFeature.resume_optimize, 'user_1', {
        resume: 'short',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AIService quota summary', () => {
  it('returns the counters used by the monthly dashboard allowance', async () => {
    const resetAt = new Date('2026-08-01T00:00:00.000Z');
    const service = new AIService(
      {
        aIRequest: { findMany: jest.fn().mockResolvedValue([]) },
        usageLimit: {
          findUnique: jest.fn().mockResolvedValue({
            aiRequestsUsed: 2,
            aiRequestsMax: 5,
            resumeOptimizationsUsed: 1,
            resumeOptimizationsMax: 1,
            resetAt,
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { now: () => new Date('2026-07-27T12:00:00.000Z') } as never,
    );

    await expect(
      service.getCostSummary(
        'user_1',
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-31T23:59:59.999Z'),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        quota: {
          aiRequestsUsed: 2,
          aiRequestsMax: 5,
          resumeOptimizationsUsed: 1,
          resumeOptimizationsMax: 1,
          resetAt,
        },
      }),
    );
  });
});

describe('AIService plan-aware execution and quota rollback', () => {
  function createService(route: { boundary: 'free' | 'paid' }) {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user_1' }) },
      usageLimit: {
        findUnique: jest.fn().mockResolvedValue({
          aiRequestsUsed: 0,
          aiRequestsMax: 5,
          resetAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      aIRequest: { create: jest.fn().mockResolvedValue({ id: 'request_1' }) },
      $transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    const router = {
      resolve: jest.fn().mockResolvedValue({
        ...route,
        maxInputBytes: 100_000,
        maxOutputTokens: 1_024,
        ...(route.boundary === 'paid' ? { maxRequestCostUsd: 1 } : {}),
      }),
      complete: jest.fn(),
    };
    const providerFactory = {
      getInputCostPerMillion: jest.fn().mockReturnValue(0.1),
      getOutputCostPerMillion: jest.fn().mockReturnValue(0.2),
      getProviderName: jest.fn().mockReturnValue('openai'),
    };
    const service = new AIService(
      prisma as never,
      providerFactory as never,
      router as never,
      { loadTemplate: jest.fn().mockReturnValue('System\n## Resume\n{{resume}}') } as never,
      {} as never,
    );
    return { prisma, router, service };
  }

  it('records a successful GLM request once through the trusted Free route', async () => {
    const { prisma, router, service } = createService({ boundary: 'free' });
    router.complete.mockResolvedValue({
      boundary: 'free',
      providerName: 'glm',
      response: { content: '{}', model: 'glm-model', tokensUsed: { input: 2, output: 3 } },
    });

    await expect(
      service.complete(AIRequestFeature.resume_parse, 'user_1', { resume: 'synthetic' }),
    ).resolves.toEqual({ content: '{}', model: 'glm-model' });

    expect(prisma.aIRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'glm',
        tokensUsed: 5,
        cost: 0,
      }),
    });
    expect(prisma.usageLimit.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { aiRequestsUsed: { decrement: 1 } } }),
    );
  });

  it('releases a reserved Free allowance after a GLM failure', async () => {
    const { prisma, router, service } = createService({ boundary: 'free' });
    router.complete.mockRejectedValue(new Error('synthetic provider failure'));

    await expect(
      service.complete(AIRequestFeature.resume_parse, 'user_1', { resume: 'synthetic' }),
    ).rejects.toThrow('synthetic provider failure');

    expect(prisma.aIRequest.create).not.toHaveBeenCalled();
    expect(prisma.usageLimit.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        resetAt: new Date('2026-08-01T00:00:00.000Z'),
        aiRequestsUsed: { gt: 0 },
      },
      data: { aiRequestsUsed: { decrement: 1 } },
    });
  });

  it('revalidates a queued boundary immediately before execution and releases its reservation on a plan change', async () => {
    const { prisma, router, service } = createService({ boundary: 'free' });
    router.resolve
      .mockResolvedValueOnce({
        boundary: 'free',
        maxInputBytes: 100_000,
        maxOutputTokens: 1_024,
      })
      .mockResolvedValueOnce({
        boundary: 'paid',
        maxInputBytes: 100_000,
        maxOutputTokens: 1_024,
        maxRequestCostUsd: 1,
      });

    await expect(
      service.complete(
        AIRequestFeature.resume_parse,
        'user_1',
        { resume: 'synthetic' },
        'free',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(router.complete).not.toHaveBeenCalled();
    expect(prisma.aIRequest.create).not.toHaveBeenCalled();
    expect(prisma.usageLimit.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        resetAt: new Date('2026-08-01T00:00:00.000Z'),
        aiRequestsUsed: { gt: 0 },
      },
      data: { aiRequestsUsed: { decrement: 1 } },
    });
  });

  it('does not reserve allowance or call a provider when entitlement resolution fails', async () => {
    const { prisma, router, service } = createService({ boundary: 'free' });
    router.resolve.mockRejectedValue(new ForbiddenException('invalid entitlement'));

    await expect(
      service.complete(AIRequestFeature.resume_parse, 'user_1', { resume: 'synthetic' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(router.complete).not.toHaveBeenCalled();
  });
});
