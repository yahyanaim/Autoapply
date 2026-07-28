ALTER TABLE "usage_limits"
  ADD COLUMN "resumeOptimizationsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resumeOptimizationsMax" INTEGER NOT NULL DEFAULT 1;

UPDATE "usage_limits" AS usage
SET
  "aiRequestsMax" = CASE
    WHEN subscription."status" IN ('active', 'trialing', 'past_due')
      AND subscription."plan" = 'premium' THEN 2147483647
    WHEN subscription."status" IN ('active', 'trialing', 'past_due')
      AND subscription."plan" = 'pro' THEN 500
    ELSE 5
  END,
  "resumeOptimizationsMax" = CASE
    WHEN subscription."status" IN ('active', 'trialing', 'past_due')
      AND subscription."plan" IN ('pro', 'premium') THEN 2147483647
    ELSE 1
  END
FROM "subscriptions" AS subscription
WHERE subscription."userId" = usage."userId";

UPDATE "usage_limits" AS usage
SET "resumeOptimizationsUsed" = LEAST(
  usage."resumeOptimizationsMax",
  (
    SELECT COUNT(*)::INTEGER
    FROM "ai_requests" AS request
    WHERE request."userId" = usage."userId"
      AND request."feature" = 'resume_optimize'
      AND request."createdAt" >= usage."resetAt"
  )
);

ALTER TABLE "usage_limits"
  ALTER COLUMN "aiRequestsMax" SET DEFAULT 5;
