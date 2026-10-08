-- One durable, idempotent Admin scheduling intent per existing Billing evidence case.
-- The request contains no webhook payload or raw idempotency key.
ALTER TYPE "ActivityType" ADD VALUE 'admin_webhook_retry';

-- Future verified deliveries carry the signed event creation time. Existing
-- records remain null and are inspection-only for provider retrieval.
ALTER TABLE "billing_verified_webhook_deliveries"
  ADD COLUMN "eventCreatedAt" TIMESTAMP(3);

ALTER TABLE "billing_financial_evidence_cases"
  ADD COLUMN "adminRetryDeliveryId" TEXT,
  ADD COLUMN "adminRetryKeyHash" TEXT,
  ADD COLUMN "adminRetryFingerprint" TEXT,
  ADD COLUMN "adminRetryRequestedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "billing_financial_evidence_cases_adminRetryDeliveryId_key"
  ON "billing_financial_evidence_cases"("adminRetryDeliveryId");
CREATE UNIQUE INDEX "billing_financial_evidence_cases_adminRetryKeyHash_key"
  ON "billing_financial_evidence_cases"("adminRetryKeyHash");
