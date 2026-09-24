import { JobStatus, Prisma } from '@prisma/client';

/**
 * Returns the listings a user may use for a new job-search action.
 *
 * Public provider listings must have been observed recently. A candidate's
 * own extension capture is retained because the candidate can still decide
 * whether that page remains relevant. Existing application records are not
 * affected by this policy and remain available as history.
 */
export function visibleJobSources(
  userId: string | undefined,
  now: Date,
  maxAgeHours: number,
): Prisma.JobWhereInput[] {
  const minimumPublicListingDate = new Date(
    now.getTime() - maxAgeHours * 60 * 60 * 1_000,
  );
  const publicListing: Prisma.JobWhereInput = {
    status: JobStatus.active,
    capturedByUserId: null,
    scrapedAt: { gte: minimumPublicListingDate },
  };

  return userId
    ? [publicListing, { capturedByUserId: userId, status: JobStatus.active }]
    : [publicListing];
}

export function accessibleFreshJobWhere(
  userId: string,
  jobId: string,
  now: Date,
  maxAgeHours: number,
): Prisma.JobWhereInput {
  return {
    id: jobId,
    OR: visibleJobSources(userId, now, maxAgeHours),
  };
}
