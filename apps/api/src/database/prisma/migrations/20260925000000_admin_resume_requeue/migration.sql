-- CreateEnum
CREATE TYPE "ResumeParseExecutionStatus" AS ENUM (
  'requeue_requested',
  'queued',
  'processing',
  'retrying',
  'succeeded',
  'failed_requeueable',
  'failed_permanent'
);

-- CreateEnum
CREATE TYPE "ResumeParseFailureCategory" AS ENUM (
  'provider_transient',
  'storage_transient',
  'worker_crash',
  'document_unreadable',
  'document_empty',
  'provider_response_invalid',
  'provider_configuration',
  'authorization',
  'entitlement_changed',
  'record_missing',
  'internal_unknown',
  'legacy_unclassified'
);

-- CreateEnum
CREATE TYPE "ResumeParseDispatchStatus" AS ENUM ('pending', 'dispatching', 'dispatched');

-- CreateEnum
CREATE TYPE "ResumeRequeueReason" AS ENUM ('provider_recovered', 'storage_recovered', 'worker_recovery');

-- CreateEnum
CREATE TYPE "ResumeParseExecutionOrigin" AS ENUM ('initial', 'admin_requeue');

-- AlterEnum
ALTER TYPE "ActivityType"
ADD VALUE IF NOT EXISTS 'admin_resume_requeue';

-- AlterTable
ALTER TABLE "resume_parse_execution_claims"
ADD COLUMN "executionId" TEXT,
ADD COLUMN "leaseVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "resume_parse_executions" (
  "id" TEXT NOT NULL,
  "resumeId" TEXT NOT NULL,
  "predecessorExecutionId" TEXT,
  "generation" INTEGER NOT NULL,
  "origin" "ResumeParseExecutionOrigin" NOT NULL,
  "executionBoundary" TEXT NOT NULL,
  "status" "ResumeParseExecutionStatus" NOT NULL,
  "failureCategory" "ResumeParseFailureCategory",
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "queueName" TEXT NOT NULL,
  "queueJobId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "requeueReason" "ResumeRequeueReason",
  "idempotencyKeyHash" TEXT,
  "requestFingerprint" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queuedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "resume_parse_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_parse_dispatches" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "status" "ResumeParseDispatchStatus" NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "lastErrorCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "resume_parse_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resume_parse_execution_claims_executionId_key"
ON "resume_parse_execution_claims"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "resume_parse_executions_predecessorExecutionId_key"
ON "resume_parse_executions"("predecessorExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "resume_parse_executions_queueJobId_key"
ON "resume_parse_executions"("queueJobId");

-- CreateIndex
CREATE UNIQUE INDEX "resume_parse_executions_resumeId_generation_key"
ON "resume_parse_executions"("resumeId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "resume_parse_executions_requestedByUserId_idempotencyKeyHash_key"
ON "resume_parse_executions"("requestedByUserId", "idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "resume_parse_executions_resumeId_createdAt_idx"
ON "resume_parse_executions"("resumeId", "createdAt");

-- CreateIndex
CREATE INDEX "resume_parse_executions_status_failedAt_idx"
ON "resume_parse_executions"("status", "failedAt");

-- CreateIndex
CREATE UNIQUE INDEX "resume_parse_dispatches_executionId_key"
ON "resume_parse_dispatches"("executionId");

-- CreateIndex
CREATE INDEX "resume_parse_dispatches_status_availableAt_idx"
ON "resume_parse_dispatches"("status", "availableAt");

-- CreateIndex
CREATE INDEX "resume_parse_dispatches_status_leaseExpiresAt_idx"
ON "resume_parse_dispatches"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "resume_parse_execution_claims"
ADD CONSTRAINT "resume_parse_execution_claims_executionId_fkey"
FOREIGN KEY ("executionId") REFERENCES "resume_parse_executions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_parse_executions"
ADD CONSTRAINT "resume_parse_executions_resumeId_fkey"
FOREIGN KEY ("resumeId") REFERENCES "resumes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_parse_executions"
ADD CONSTRAINT "resume_parse_executions_predecessorExecutionId_fkey"
FOREIGN KEY ("predecessorExecutionId") REFERENCES "resume_parse_executions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_parse_executions"
ADD CONSTRAINT "resume_parse_executions_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_parse_dispatches"
ADD CONSTRAINT "resume_parse_dispatches_executionId_fkey"
FOREIGN KEY ("executionId") REFERENCES "resume_parse_executions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
