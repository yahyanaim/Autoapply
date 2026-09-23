ALTER TABLE "activity_logs"
  ADD COLUMN "actorUserId" TEXT,
  ADD COLUMN "targetType" TEXT,
  ADD COLUMN "targetId" TEXT,
  ADD COLUMN "action" TEXT,
  ADD COLUMN "before" JSONB,
  ADD COLUMN "after" JSONB,
  ADD COLUMN "correlationId" TEXT;
CREATE INDEX "activity_logs_actorUserId_createdAt_idx" ON "activity_logs"("actorUserId", "createdAt");
CREATE INDEX "activity_logs_targetType_targetId_createdAt_idx" ON "activity_logs"("targetType", "targetId", "createdAt");
