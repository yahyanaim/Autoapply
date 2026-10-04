CREATE TYPE "BillingStripeFeeResolution" AS ENUM ('recorded', 'duplicate_balance_transaction', 'zero_fee', 'unsupported_currency', 'pre_boundary', 'missing_authoritative_transaction', 'missing_authoritative_fee');

CREATE TABLE "billing_stripe_fee_metrics_boundaries" (
    "id" TEXT NOT NULL,
    "metricsStartAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_stripe_fee_metrics_boundaries_pkey" PRIMARY KEY ("id")
);

-- timestamptz -> timestamp is explicitly evaluated in UTC, independent of session TimeZone.
INSERT INTO "billing_stripe_fee_metrics_boundaries" ("id", "metricsStartAt", "currency")
VALUES ('stripe_fees_v1', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'usd');

CREATE TABLE "billing_stripe_fee_observations" (
    "id" TEXT NOT NULL,
    "sourceStripeEventId" TEXT NOT NULL,
    "resolution" "BillingStripeFeeResolution" NOT NULL,
    "balanceTransactionId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_stripe_fee_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_stripe_fee_effects" (
    "id" TEXT NOT NULL,
    "sourceStripeEventId" TEXT NOT NULL,
    "balanceTransactionId" TEXT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_stripe_fee_effects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_daily_stripe_fee_metrics" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "feeEffectCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_daily_stripe_fee_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_stripe_fee_observations_sourceStripeEventId_key" ON "billing_stripe_fee_observations"("sourceStripeEventId");
CREATE INDEX "billing_stripe_fee_observations_observedAt_idx" ON "billing_stripe_fee_observations"("observedAt");
CREATE UNIQUE INDEX "billing_stripe_fee_effects_sourceStripeEventId_key" ON "billing_stripe_fee_effects"("sourceStripeEventId");
CREATE UNIQUE INDEX "billing_stripe_fee_effects_balanceTransactionId_key" ON "billing_stripe_fee_effects"("balanceTransactionId");
CREATE INDEX "billing_stripe_fee_effects_effectiveAt_currency_idx" ON "billing_stripe_fee_effects"("effectiveAt", "currency");
CREATE UNIQUE INDEX "billing_daily_stripe_fee_metrics_day_currency_key" ON "billing_daily_stripe_fee_metrics"("day", "currency");
CREATE INDEX "billing_daily_stripe_fee_metrics_day_idx" ON "billing_daily_stripe_fee_metrics"("day");

ALTER TABLE "billing_stripe_fee_observations" ADD CONSTRAINT "billing_stripe_fee_observations_sourceStripeEventId_fkey" FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_stripe_fee_effects" ADD CONSTRAINT "billing_stripe_fee_effects_sourceStripeEventId_fkey" FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
