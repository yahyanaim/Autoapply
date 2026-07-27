ALTER TABLE "usage_limits"
  ADD COLUMN "jobDiscoveriesUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "jobDiscoveriesMax" INTEGER NOT NULL DEFAULT 3;

UPDATE "usage_limits" AS usage
SET "jobDiscoveriesMax" = CASE
  WHEN subscription."status" IN ('active', 'trialing', 'past_due')
    AND subscription."plan" = 'premium' THEN 2147483647
  WHEN subscription."status" IN ('active', 'trialing', 'past_due')
    AND subscription."plan" = 'pro' THEN 50
  ELSE 3
END
FROM "subscriptions" AS subscription
WHERE subscription."userId" = usage."userId";
