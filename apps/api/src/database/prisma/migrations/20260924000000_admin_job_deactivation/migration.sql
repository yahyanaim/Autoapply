-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "JobDeactivationReason" AS ENUM ('provider_removed', 'invalid_listing', 'duplicate', 'policy_violation', 'security_risk', 'other');

-- AlterEnum
ALTER TYPE "ActivityType"
ADD VALUE IF NOT EXISTS 'admin_job_deactivate';

-- AlterTable
ALTER TABLE "jobs"
ADD COLUMN "status" "JobStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "deactivatedByUserId" TEXT,
ADD COLUMN "deactivationReason" "JobDeactivationReason";

-- CreateIndex
CREATE INDEX "jobs_deactivatedByUserId_idx" ON "jobs"("deactivatedByUserId");

-- CreateIndex
CREATE INDEX "jobs_status_scrapedAt_idx" ON "jobs"("status", "scrapedAt");

-- AddForeignKey
ALTER TABLE "jobs"
ADD CONSTRAINT "jobs_deactivatedByUserId_fkey"
FOREIGN KEY ("deactivatedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
