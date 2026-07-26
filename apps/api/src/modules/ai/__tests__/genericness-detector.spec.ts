import { scoreGenericness } from '../domain/genericness-detector';

describe('cover-letter genericness detector', () => {
  it('flags repeated filler language', () => {
    const result = scoreGenericness(
      'I am writing to express my interest. I am a hardworking team player who is passionate about technology and thrives in a fast-paced environment.',
    );

    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.matchedPhrases).toContain(
      'i am writing to express my interest',
    );
  });

  it('keeps specific evidence below the rejection threshold', () => {
    const content = `
      At Acme, I reduced API latency by 38% while migrating 14 TypeScript
      services to PostgreSQL and Redis. That work maps directly to your platform
      team's goal of improving checkout reliability across the European region.
      I also led a six-person incident review program that reduced repeat
      production failures over two quarters.

      I would welcome the opportunity to discuss how those reliability and
      migration lessons could support AcmeCloud's 2026 platform roadmap.
    `.repeat(2);

    expect(scoreGenericness(content).score).toBeLessThan(50);
  });
});
