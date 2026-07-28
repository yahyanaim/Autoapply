import {
  MATCH_SCORE_ALGORITHM_VERSION,
  MatchScoreCacheService,
} from '../application/match-score-cache.service';

describe('MatchScoreCacheService', () => {
  let prisma: {
    matchScoreCache: {
      findMany: jest.Mock;
      createMany: jest.Mock;
    };
  };
  let service: MatchScoreCacheService;

  beforeEach(() => {
    prisma = {
      matchScoreCache: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new MatchScoreCacheService(prisma as never);
  });

  it('calculates deterministic scores and stores only one row per unique input', async () => {
    const results = await service.scoreMany(
      'resume-1',
      JSON.stringify({ skills: ['TypeScript'] }),
      ['TypeScript is required.', 'TypeScript is required.'],
    );

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.cached === false)).toBe(true);
    expect(prisma.matchScoreCache.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          resumeId: 'resume-1',
          inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          algorithmVersion: MATCH_SCORE_ALGORITHM_VERSION,
          score: expect.any(Number),
          confidence: expect.any(Number),
          matchedKeywords: expect.any(Array),
          breakdown: expect.any(Object),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('returns a stored score without writing another cache row', async () => {
    prisma.matchScoreCache.findMany.mockImplementation(
      async ({ where }: { where: { inputHash: { in: string[] } } }) => [
        {
          inputHash: where.inputHash.in[0],
          score: 91,
          confidence: 88,
          matchedKeywords: ['TypeScript'],
          missingKeywords: ['Go'],
          weakSections: [],
          breakdown: {
            skills: 90,
            experience: 92,
            responsibilities: 88,
            education: null,
            languages: null,
            certifications: null,
          },
          explanation: ['Stored explanation'],
        },
      ],
    );

    await expect(
      service.score('resume-1', '{"skills":["TypeScript"]}', 'Go is required.'),
    ).resolves.toEqual({
      score: 91,
      confidence: 88,
      matchedKeywords: ['TypeScript'],
      missingKeywords: ['Go'],
      weakSections: [],
      breakdown: {
        skills: 90,
        experience: 92,
        responsibilities: 88,
        education: null,
        languages: null,
        certifications: null,
      },
      explanation: ['Stored explanation'],
      cached: true,
    });
    expect(prisma.matchScoreCache.createMany).not.toHaveBeenCalled();
  });

  it('keeps scoring available when the cache database operation fails', async () => {
    prisma.matchScoreCache.findMany.mockRejectedValue(
      new Error('cache unavailable'),
    );

    await expect(
      service.score(
        'resume-1',
        '{"skills":["React"]}',
        'React is required for this role.',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        cached: false,
      }),
    );
  });
});
