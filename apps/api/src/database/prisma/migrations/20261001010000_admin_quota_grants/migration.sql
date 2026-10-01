-- Future-only additive quota grants. Existing usage is intentionally not backfilled.
CREATE TYPE "QuotaGrantCategory" AS ENUM (
  'applications',
  'ai_requests',
  'resume_optimizations',
  'job_discoveries',
  'resumes',
  'storage_bytes'
);

CREATE TYPE "QuotaGrantReason" AS ENUM (
  'customer_support',
  'service_recovery',
  'beta_program'
);

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'admin_quota_grant';

CREATE TABLE "quota_grants" (
  "id" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "category" "QuotaGrantCategory" NOT NULL,
  "amount" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reason" "QuotaGrantReason" NOT NULL,
  "grantedByUserId" TEXT,
  "idempotencyKeyHash" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "effectiveLimitAtCreation" INTEGER NOT NULL,
  "remainingAtCreation" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quota_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quota_grants_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "quota_grants_grantedByUserId_idempotencyKeyHash_key"
  ON "quota_grants"("grantedByUserId", "idempotencyKeyHash");
CREATE INDEX "quota_grants_targetUserId_category_expiresAt_idx"
  ON "quota_grants"("targetUserId", "category", "expiresAt");

ALTER TABLE "quota_grants"
  ADD CONSTRAINT "quota_grants_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quota_grants"
  ADD CONSTRAINT "quota_grants_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
