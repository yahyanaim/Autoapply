CREATE TABLE "admin_step_up_mfa_proofs" (
  "id" TEXT NOT NULL,
  "proofHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_step_up_mfa_proofs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_step_up_mfa_proofs_proofHash_key" ON "admin_step_up_mfa_proofs"("proofHash");
CREATE INDEX "admin_step_up_mfa_proofs_actorUserId_sessionId_action_targetType_targetId_expiresAt_idx" ON "admin_step_up_mfa_proofs"("actorUserId", "sessionId", "action", "targetType", "targetId", "expiresAt");
