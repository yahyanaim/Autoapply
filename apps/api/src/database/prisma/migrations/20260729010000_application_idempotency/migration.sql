ALTER TABLE "applications"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyFingerprint" TEXT;

CREATE UNIQUE INDEX "applications_userId_idempotencyKey_key"
  ON "applications"("userId", "idempotencyKey");
