CREATE TYPE "IdempotencyStatus" AS ENUM ('pending', 'completed');

CREATE TABLE "idempotency_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "status" "IdempotencyStatus" NOT NULL DEFAULT 'pending',
  "response" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_userId_key_key"
  ON "idempotency_records"("userId", "key");

CREATE INDEX "idempotency_records_expiresAt_idx"
  ON "idempotency_records"("expiresAt");

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
