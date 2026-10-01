-- Financial metrics begin at this migration boundary. Existing payments are
-- deliberately not backfilled because their authoritative effective-time,
-- refund, dispute, and fee history is incomplete.

CREATE TYPE "BillingFinancialEventCategory" AS ENUM ('gross_revenue');

CREATE TABLE "billing_financial_metrics_boundaries" (
  "id" TEXT NOT NULL,
  "metricsStartAt" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_financial_metrics_boundaries_pkey" PRIMARY KEY ("id")
);

INSERT INTO "billing_financial_metrics_boundaries" (
  "id",
  "metricsStartAt",
  "currency"
) VALUES (
  'future_financial_metrics_v1',
  CURRENT_TIMESTAMP,
  'usd'
);

CREATE TABLE "billing_financial_events" (
  "id" TEXT NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  "sourceStripeEventId" TEXT NOT NULL,
  "category" "BillingFinancialEventCategory" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_financial_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_financial_events_sequence_key"
  ON "billing_financial_events"("sequence");
CREATE UNIQUE INDEX "billing_financial_events_sourceStripeEventId_key"
  ON "billing_financial_events"("sourceStripeEventId");
CREATE INDEX "billing_financial_events_effectiveAt_sequence_idx"
  ON "billing_financial_events"("effectiveAt", "sequence");
CREATE INDEX "billing_financial_events_category_effectiveAt_idx"
  ON "billing_financial_events"("category", "effectiveAt");

ALTER TABLE "billing_financial_events"
  ADD CONSTRAINT "billing_financial_events_sourceStripeEventId_fkey"
  FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "billing_daily_financial_metrics" (
  "id" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "grossRevenueMinor" BIGINT NOT NULL DEFAULT 0,
  "successfulPaymentCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_daily_financial_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_daily_financial_metrics_day_currency_key"
  ON "billing_daily_financial_metrics"("day", "currency");
CREATE INDEX "billing_daily_financial_metrics_day_idx"
  ON "billing_daily_financial_metrics"("day");
