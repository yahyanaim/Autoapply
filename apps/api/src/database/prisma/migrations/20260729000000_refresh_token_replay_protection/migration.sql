ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'auth_token_reuse';

CREATE TABLE "refresh_token_history" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "detectedAt" TIMESTAMP(3),

  CONSTRAINT "refresh_token_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_token_history_tokenHash_key"
  ON "refresh_token_history"("tokenHash");

CREATE INDEX "refresh_token_history_sessionId_idx"
  ON "refresh_token_history"("sessionId");

CREATE INDEX "refresh_token_history_userId_idx"
  ON "refresh_token_history"("userId");

CREATE INDEX "refresh_token_history_expiresAt_idx"
  ON "refresh_token_history"("expiresAt");

ALTER TABLE "refresh_token_history"
  ADD CONSTRAINT "refresh_token_history_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
