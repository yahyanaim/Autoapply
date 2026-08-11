ALTER TYPE "ActivityType" ADD VALUE 'auth_login_failed';
ALTER TYPE "ActivityType" ADD VALUE 'auth_account_locked';

ALTER TABLE "users"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);
