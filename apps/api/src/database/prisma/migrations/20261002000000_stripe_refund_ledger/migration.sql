CREATE TYPE "BillingRefundStatus" AS ENUM ('pending', 'requires_action', 'succeeded', 'failed', 'canceled');
CREATE TYPE "BillingRefundCurrencySupport" AS ENUM ('usd', 'unsupported');

CREATE TABLE "billing_refund_metrics_boundaries" (
    "id" TEXT NOT NULL,
    "metricsStartAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_refund_metrics_boundaries_pkey" PRIMARY KEY ("id")
);

INSERT INTO "billing_refund_metrics_boundaries" ("id", "metricsStartAt", "currency")
VALUES ('stripe_refunds_v1', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'usd');

CREATE TABLE "billing_refunds" (
    "id" TEXT NOT NULL,
    "stripeRefundId" TEXT NOT NULL,
    "chargeId" TEXT,
    "paymentIntentId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "currencySupport" "BillingRefundCurrencySupport" NOT NULL,
    "providerCreatedAt" TIMESTAMP(3) NOT NULL,
    "firstSucceededSourceEventId" TEXT,
    "firstSucceededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_refund_observations" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "sourceStripeEventId" TEXT NOT NULL,
    "status" "BillingRefundStatus" NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_refund_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_refund_effects" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "sourceStripeEventId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_refund_effects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_daily_refund_metrics" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "refundAdjustmentMinor" BIGINT NOT NULL DEFAULT 0,
    "successfulRefundCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_daily_refund_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_refunds_stripeRefundId_key" ON "billing_refunds"("stripeRefundId");
CREATE INDEX "billing_refunds_chargeId_idx" ON "billing_refunds"("chargeId");
CREATE INDEX "billing_refunds_paymentIntentId_idx" ON "billing_refunds"("paymentIntentId");
CREATE UNIQUE INDEX "billing_refund_observations_sourceStripeEventId_key" ON "billing_refund_observations"("sourceStripeEventId");
CREATE INDEX "billing_refund_observations_refundId_eventAt_idx" ON "billing_refund_observations"("refundId", "eventAt");
CREATE UNIQUE INDEX "billing_refund_effects_refundId_key" ON "billing_refund_effects"("refundId");
CREATE UNIQUE INDEX "billing_refund_effects_sourceStripeEventId_key" ON "billing_refund_effects"("sourceStripeEventId");
CREATE INDEX "billing_refund_effects_effectiveAt_idx" ON "billing_refund_effects"("effectiveAt");
CREATE UNIQUE INDEX "billing_daily_refund_metrics_day_currency_key" ON "billing_daily_refund_metrics"("day", "currency");
CREATE INDEX "billing_daily_refund_metrics_day_idx" ON "billing_daily_refund_metrics"("day");

ALTER TABLE "billing_refund_observations" ADD CONSTRAINT "billing_refund_observations_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "billing_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_refund_observations" ADD CONSTRAINT "billing_refund_observations_sourceStripeEventId_fkey" FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_refund_effects" ADD CONSTRAINT "billing_refund_effects_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "billing_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_refund_effects" ADD CONSTRAINT "billing_refund_effects_sourceStripeEventId_fkey" FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
