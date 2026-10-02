CREATE TYPE "BillingDisputeStatus" AS ENUM ('warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost');
CREATE TYPE "BillingDisputeObservationType" AS ENUM ('created', 'updated', 'closed', 'funds_withdrawn', 'funds_reinstated');
CREATE TYPE "BillingDisputeObservationResolution" AS ENUM ('status_only', 'movement_recorded', 'duplicate_movement', 'missing_authoritative_transaction', 'unsupported_currency', 'pre_boundary');
CREATE TYPE "BillingDisputeMovementKind" AS ENUM ('withdrawal', 'reinstatement');

CREATE TABLE "billing_dispute_metrics_boundaries" (
    "id" TEXT NOT NULL,
    "metricsStartAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_dispute_metrics_boundaries_pkey" PRIMARY KEY ("id")
);

INSERT INTO "billing_dispute_metrics_boundaries" ("id", "metricsStartAt", "currency")
VALUES ('stripe_disputes_v1', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'usd');

CREATE TABLE "billing_disputes" (
    "id" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "chargeId" TEXT,
    "paymentIntentId" TEXT,
    "currency" TEXT NOT NULL,
    "providerCreatedAt" TIMESTAMP(3) NOT NULL,
    "currentStatus" "BillingDisputeStatus" NOT NULL,
    "currentStatusEventAt" TIMESTAMP(3) NOT NULL,
    "currentStatusEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_disputes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_dispute_observations" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "sourceStripeEventId" TEXT NOT NULL,
    "type" "BillingDisputeObservationType" NOT NULL,
    "status" "BillingDisputeStatus" NOT NULL,
    "resolution" "BillingDisputeObservationResolution" NOT NULL,
    "balanceTransactionId" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_dispute_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_dispute_effects" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "sourceStripeEventId" TEXT NOT NULL,
    "balanceTransactionId" TEXT NOT NULL,
    "kind" "BillingDisputeMovementKind" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_dispute_effects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_daily_dispute_metrics" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "withdrawnMinor" BIGINT NOT NULL DEFAULT 0,
    "reinstatedMinor" BIGINT NOT NULL DEFAULT 0,
    "withdrawalCount" INTEGER NOT NULL DEFAULT 0,
    "reinstatementCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_daily_dispute_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_disputes_stripeDisputeId_key" ON "billing_disputes"("stripeDisputeId");
CREATE INDEX "billing_disputes_chargeId_idx" ON "billing_disputes"("chargeId");
CREATE INDEX "billing_disputes_paymentIntentId_idx" ON "billing_disputes"("paymentIntentId");
CREATE UNIQUE INDEX "billing_dispute_observations_sourceStripeEventId_key" ON "billing_dispute_observations"("sourceStripeEventId");
CREATE INDEX "billing_dispute_observations_disputeId_eventAt_idx" ON "billing_dispute_observations"("disputeId", "eventAt");
CREATE UNIQUE INDEX "billing_dispute_effects_sourceStripeEventId_key" ON "billing_dispute_effects"("sourceStripeEventId");
CREATE UNIQUE INDEX "billing_dispute_effects_balanceTransactionId_key" ON "billing_dispute_effects"("balanceTransactionId");
CREATE UNIQUE INDEX "billing_dispute_effects_disputeId_kind_key" ON "billing_dispute_effects"("disputeId", "kind");
CREATE INDEX "billing_dispute_effects_effectiveAt_idx" ON "billing_dispute_effects"("effectiveAt");
CREATE UNIQUE INDEX "billing_daily_dispute_metrics_day_currency_key" ON "billing_daily_dispute_metrics"("day", "currency");
CREATE INDEX "billing_daily_dispute_metrics_day_idx" ON "billing_daily_dispute_metrics"("day");

ALTER TABLE "billing_dispute_observations" ADD CONSTRAINT "billing_dispute_observations_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "billing_disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_dispute_observations" ADD CONSTRAINT "billing_dispute_observations_sourceStripeEventId_fkey" FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_dispute_effects" ADD CONSTRAINT "billing_dispute_effects_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "billing_disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_dispute_effects" ADD CONSTRAINT "billing_dispute_effects_sourceStripeEventId_fkey" FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
