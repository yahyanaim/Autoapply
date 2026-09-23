CREATE TABLE "admin_step_up_mfa_attempts" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_step_up_mfa_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_step_up_mfa_attempts_actorUserId_sessionId_action_targetType_targetId_key"
  ON "admin_step_up_mfa_attempts"("actorUserId", "sessionId", "action", "targetType", "targetId");
CREATE INDEX "admin_step_up_mfa_attempts_lockedUntil_idx"
  ON "admin_step_up_mfa_attempts"("lockedUntil");
