-- Future-only capture of signature-verified, relevant Stripe webhook deliveries.
-- No existing receipt or provider event is backfilled.
CREATE TYPE "BillingVerifiedWebhookState" AS ENUM (
  'processing', 'retryable_failure', 'unclassified_failure', 'resolved'
);
CREATE TYPE "BillingVerifiedWebhookReason" AS ENUM (
  'provider_unavailable', 'processing_error'
);

CREATE TABLE "billing_verified_webhook_boundaries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "billing_verified_webhook_boundaries" ("id", "startsAt")
VALUES ('verified_stripe_webhook_inspection_v1', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE TABLE "billing_verified_webhook_deliveries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "state" "BillingVerifiedWebhookState" NOT NULL DEFAULT 'processing',
  "reason" "BillingVerifiedWebhookReason",
  "observedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX "billing_verified_webhook_deliveries_eventId_state_idx"
  ON "billing_verified_webhook_deliveries"("eventId", "state");
CREATE INDEX "billing_verified_webhook_deliveries_observedAt_id_idx"
  ON "billing_verified_webhook_deliveries"("observedAt", "id");
CREATE INDEX "billing_verified_webhook_deliveries_state_observedAt_id_idx"
  ON "billing_verified_webhook_deliveries"("state", "observedAt", "id");
