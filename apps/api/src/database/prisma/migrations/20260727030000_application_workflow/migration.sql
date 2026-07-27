ALTER TYPE "AIRequestFeature" ADD VALUE IF NOT EXISTS 'job_analyze';

CREATE TYPE "ApplicationPreparationStatus" AS ENUM (
  'job_captured',
  'analyzing',
  'generating',
  'ready_for_review',
  'ready_to_submit',
  'generation_failed'
);

ALTER TABLE "applications"
  ADD COLUMN "sourceResumeId" TEXT,
  ADD COLUMN "preparationStatus" "ApplicationPreparationStatus" NOT NULL DEFAULT 'job_captured',
  ADD COLUMN "jobAnalysis" JSONB,
  ADD COLUMN "generationError" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedResumeHash" TEXT,
  ADD COLUMN "approvedCoverLetterHash" TEXT;

ALTER TABLE "cover_letters"
  ADD COLUMN "resumeVersionId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "jobs"
  ADD COLUMN "capturedByUserId" TEXT,
  ADD COLUMN "sourceKey" TEXT;

DROP INDEX IF EXISTS "jobs_sourceUrl_key";
UPDATE "jobs"
SET "sourceKey" = 'public:' || "sourceUrl"
WHERE "sourceUrl" IS NOT NULL;
CREATE UNIQUE INDEX "jobs_sourceKey_key" ON "jobs"("sourceKey");

CREATE INDEX "cover_letters_resumeVersionId_idx" ON "cover_letters"("resumeVersionId");
CREATE INDEX "applications_sourceResumeId_idx" ON "applications"("sourceResumeId");
CREATE INDEX "jobs_capturedByUserId_idx" ON "jobs"("capturedByUserId");

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_sourceResumeId_fkey"
  FOREIGN KEY ("sourceResumeId") REFERENCES "resumes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cover_letters"
  ADD CONSTRAINT "cover_letters_resumeVersionId_fkey"
  FOREIGN KEY ("resumeVersionId") REFERENCES "resume_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_capturedByUserId_fkey"
  FOREIGN KEY ("capturedByUserId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
