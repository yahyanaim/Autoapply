-- Durable subscription lifecycle history begins at this migration boundary.
-- Existing subscription rows are captured only as an aggregate baseline; no
-- historical transition rows are fabricated or backfilled.

CREATE TYPE "SubscriptionLifecycleEventCategory" AS ENUM (
  'paid_activation',
  'plan_upgrade',
  'plan_downgrade',
  'cancellation',
  'reactivation',
  'trial_start',
  'trial_conversion',
  'past_due_transition',
  'pause_transition',
  'unpaid_transition',
  'subscription_deletion',
  'observation'
);

CREATE TABLE "billing_metrics_history_boundaries" (
  "id" TEXT NOT NULL,
  "historyAvailableFrom" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "baselineActivePaidSubscriptions" INTEGER NOT NULL,
  "baselineActiveProSubscriptions" INTEGER NOT NULL,
  "baselineActivePremiumSubscriptions" INTEGER NOT NULL,
  "baselineMonthlyRecurringRevenueMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_metrics_history_boundaries_pkey" PRIMARY KEY ("id")
);

INSERT INTO "billing_metrics_history_boundaries" (
  "id",
  "historyAvailableFrom",
  "currency",
  "baselineActivePaidSubscriptions",
  "baselineActiveProSubscriptions",
  "baselineActivePremiumSubscriptions",
  "baselineMonthlyRecurringRevenueMinor"
)
SELECT
  'subscription_lifecycle_v1',
  CURRENT_TIMESTAMP,
  'usd',
  COUNT(*) FILTER (
    WHERE "status" = 'active'::"SubscriptionStatus"
      AND "plan" IN ('pro'::"SubscriptionPlan", 'premium'::"SubscriptionPlan")
  )::INTEGER,
  COUNT(*) FILTER (
    WHERE "status" = 'active'::"SubscriptionStatus"
      AND "plan" = 'pro'::"SubscriptionPlan"
  )::INTEGER,
  COUNT(*) FILTER (
    WHERE "status" = 'active'::"SubscriptionStatus"
      AND "plan" = 'premium'::"SubscriptionPlan"
  )::INTEGER,
  (
    COUNT(*) FILTER (
      WHERE "status" = 'active'::"SubscriptionStatus"
        AND "plan" = 'pro'::"SubscriptionPlan"
    ) * 1900
    + COUNT(*) FILTER (
      WHERE "status" = 'active'::"SubscriptionStatus"
        AND "plan" = 'premium'::"SubscriptionPlan"
    ) * 4900
  )::INTEGER
FROM "subscriptions";

CREATE TABLE "subscription_lifecycle_events" (
  "id" TEXT NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  -- Kept as an opaque Billing identity so lifecycle history survives deletion.
  "subscriptionId" TEXT NOT NULL,
  "sourceStripeEventId" TEXT NOT NULL,
  "category" "SubscriptionLifecycleEventCategory" NOT NULL,
  "previousStatus" "SubscriptionStatus" NOT NULL,
  "nextStatus" "SubscriptionStatus" NOT NULL,
  "previousPlan" "SubscriptionPlan" NOT NULL,
  "nextPlan" "SubscriptionPlan" NOT NULL,
  "previousPriceUsdMinor" INTEGER,
  "nextPriceUsdMinor" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "subscription_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_lifecycle_events_sequence_key"
  ON "subscription_lifecycle_events"("sequence");
CREATE UNIQUE INDEX "subscription_lifecycle_events_sourceStripeEventId_key"
  ON "subscription_lifecycle_events"("sourceStripeEventId");
CREATE INDEX "subscription_lifecycle_events_subscriptionId_effectiveAt_sequence_idx"
  ON "subscription_lifecycle_events"("subscriptionId", "effectiveAt", "sequence");
CREATE INDEX "subscription_lifecycle_events_effectiveAt_sequence_idx"
  ON "subscription_lifecycle_events"("effectiveAt", "sequence");
CREATE INDEX "subscription_lifecycle_events_category_effectiveAt_idx"
  ON "subscription_lifecycle_events"("category", "effectiveAt");

ALTER TABLE "subscription_lifecycle_events"
  ADD CONSTRAINT "subscription_lifecycle_events_sourceStripeEventId_fkey"
  FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "billing_daily_subscription_metrics" (
  "id" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "activePaidDelta" INTEGER NOT NULL DEFAULT 0,
  "activeProDelta" INTEGER NOT NULL DEFAULT 0,
  "activePremiumDelta" INTEGER NOT NULL DEFAULT 0,
  "monthlyRecurringRevenueDeltaMinor" INTEGER NOT NULL DEFAULT 0,
  "newPaidSubscriptions" INTEGER NOT NULL DEFAULT 0,
  "expansionMrrMinor" INTEGER NOT NULL DEFAULT 0,
  "contractionMrrMinor" INTEGER NOT NULL DEFAULT 0,
  "churnCount" INTEGER NOT NULL DEFAULT 0,
  "churnedMrrMinor" INTEGER NOT NULL DEFAULT 0,
  "reactivationCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_daily_subscription_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_daily_subscription_metrics_day_currency_key"
  ON "billing_daily_subscription_metrics"("day", "currency");
CREATE INDEX "billing_daily_subscription_metrics_day_idx"
  ON "billing_daily_subscription_metrics"("day");
