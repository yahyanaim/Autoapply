-- Add bounded resume and storage quotas. Existing rows are backfilled from
-- their owned resume records so deployed databases remain consistent.
ALTER TABLE "usage_limits"
  ADD COLUMN "resumesUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resumesMax" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "storageBytesUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "storageBytesMax" INTEGER NOT NULL DEFAULT 5242880;

UPDATE "usage_limits" AS usage
SET
  "resumesUsed" = totals."resumeCount",
  "storageBytesUsed" = totals."storageBytes"
FROM (
  SELECT
    "userId",
    LEAST(COUNT(*), 2147483647)::INTEGER AS "resumeCount",
    LEAST(COALESCE(SUM("fileSize"), 0), 2147483647)::INTEGER AS "storageBytes"
  FROM "resumes"
  GROUP BY "userId"
) AS totals
WHERE totals."userId" = usage."userId";
