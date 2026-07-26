import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AIRequestFeature } from '@prisma/client';
import { AIService } from '../application/ai.service';

describe('AIService resume ownership and readiness', () => {
  const prisma = {
    resume: { findFirst: jest.fn() },
    job: { findUnique: jest.fn() },
    resumeVersion: { create: jest.fn() },
  };
  const service = new AIService(prisma as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scores only an owned, fully parsed resume', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: { skills: ['TypeScript', 'React'] },
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'job_1',
      description: 'TypeScript and React are required.',
    });

    await expect(
      service.matchScore('user_1', 'resume_1', 'job_1'),
    ).resolves.toEqual(expect.objectContaining({ score: expect.any(Number) }));
    expect(prisma.resume.findFirst).toHaveBeenCalledWith({
      where: { id: 'resume_1', userId: 'user_1' },
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
      parsedJson: { skills: ['TypeScript'] },
    });
    prisma.job.findUnique.mockResolvedValue({ id: 'job_1', description: 'Rust' });
    jest.spyOn(service, 'complete').mockResolvedValue({
      content: JSON.stringify({
        optimizedResumeText: '{"skills":["TypeScript","Rust"]}',
      }),
      model: 'test-model',
    });

    await expect(
      service.optimizeResume('user_1', 'resume_1', 'job_1'),
    ).rejects.toThrow(BadGatewayException);
    expect(prisma.resumeVersion.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed optimization response', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume_1',
      userId: 'user_1',
      parseStatus: 'ready',
      parsedJson: { skills: ['TypeScript'] },
    });
    prisma.job.findUnique.mockResolvedValue({ id: 'job_1', description: 'TypeScript' });
    jest.spyOn(service, 'complete').mockResolvedValue({
      content: '{"wrongField":true}',
      model: 'test-model',
    });

    await expect(
      service.optimizeResume('user_1', 'resume_1', 'job_1'),
    ).rejects.toThrow('invalid resume optimization');
    expect(prisma.resumeVersion.create).not.toHaveBeenCalled();
  });
});

describe('AIService request budgets', () => {
  it('rejects oversized prompts before reserving quota or calling a provider', async () => {
    const prisma = {
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
    };
    const promptService = {
      loadTemplate: jest.fn().mockReturnValue('System\n## Resume\n{{resume}}'),
    };
    const service = new AIService(
      prisma as never,
      providerFactory as never,
      promptService as never,
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
    };
    const service = new AIService(
      {
        user: { findFirst: jest.fn() },
        $transaction: jest.fn(),
      } as never,
      providerFactory as never,
      { loadTemplate: jest.fn().mockReturnValue('System\n## Resume\n{{resume}}') } as never,
    );

    await expect(
      service.complete(AIRequestFeature.resume_optimize, 'user_1', { resume: 'short' }),
    ).rejects.toThrow(BadRequestException);
  });
});
