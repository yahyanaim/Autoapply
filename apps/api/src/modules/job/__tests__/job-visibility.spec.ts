import {
  accessibleFreshJobWhere,
  visibleJobSources,
} from '../domain/job-visibility';

describe('job visibility policy', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');

  it('keeps public listings within the freshness window and a user-owned capture', () => {
    expect(visibleJobSources('user-1', now, 168)).toEqual([
      {
        capturedByUserId: null,
        scrapedAt: { gte: new Date('2026-09-02T12:00:00.000Z') },
      },
      { capturedByUserId: 'user-1' },
    ]);
  });

  it('uses the same policy for a direct job action', () => {
    expect(accessibleFreshJobWhere('user-1', 'job-1', now, 24)).toEqual({
      id: 'job-1',
      OR: [
        {
          capturedByUserId: null,
          scrapedAt: { gte: new Date('2026-09-08T12:00:00.000Z') },
        },
        { capturedByUserId: 'user-1' },
      ],
    });
  });
});
