-- Platform-admin suspension is intentionally distinct from login lockout.
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

ALTER TABLE "users"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedByUserId" TEXT,
  ADD COLUMN "suspensionReason" TEXT;

CREATE INDEX "users_status_createdAt_idx" ON "users"("status", "createdAt");
