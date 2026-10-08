-- Future-only provider completeness. No historical events are backfilled.
CREATE TYPE "BillingEventScanStatus" AS ENUM ('completed', 'incomplete', 'failed', 'unavailable');
CREATE TYPE "BillingEventScanFinding" AS ENUM (
  'missing_receipt', 'missing_gross_effect', 'missing_refund_observation',
  'missing_refund_effect',
  'missing_dispute_observation', 'missing_fee_observation',
  'missing_recorded_fee_effect', 'missing_dispute_effect', 'unresolved_evidence'
);
CREATE TYPE "BillingInvoiceFinancialOutcomeStatus" AS ENUM (
  'eligible', 'excluded_no_local_subscription'
);

-- Minimal durable processing outcome; no subscription or customer identity.
CREATE TABLE "billing_invoice_financial_outcomes" (
  "sourceStripeEventId" TEXT NOT NULL PRIMARY KEY,
  "status" "BillingInvoiceFinancialOutcomeStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "billing_invoice_financial_outcomes"
  ADD CONSTRAINT "billing_invoice_financial_outcomes_sourceStripeEventId_fkey"
  FOREIGN KEY ("sourceStripeEventId") REFERENCES "stripe_webhook_events"("eventId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "billing_event_scan_boundaries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "billing_event_scan_boundaries" ("id", "startsAt")
VALUES ('stripe_financial_events_v1', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE TABLE "billing_event_scans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "from" TIMESTAMP(3) NOT NULL,
  "toExclusive" TIMESTAMP(3) NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  "attemptedFrom" TIMESTAMP(3),
  "attemptedToExclusive" TIMESTAMP(3),
  "verifiedFrom" TIMESTAMP(3),
  "verifiedToExclusive" TIMESTAMP(3),
  "status" "BillingEventScanStatus" NOT NULL DEFAULT 'incomplete',
  "reason" TEXT,
  "providerCursor" TEXT,
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "billing_event_scans_createdAt_id_idx" ON "billing_event_scans"("createdAt", "id");
CREATE INDEX "billing_event_scans_from_toExclusive_createdAt_idx"
  ON "billing_event_scans"("from", "toExclusive", "createdAt");

CREATE TABLE "billing_event_scan_discrepancies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scanId" TEXT NOT NULL,
  "sourceStripeEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "finding" "BillingEventScanFinding" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "billing_event_scan_discrepancies_scanId_sourceStripeEventId_finding_key"
  ON "billing_event_scan_discrepancies"("scanId", "sourceStripeEventId", "finding");
CREATE INDEX "billing_event_scan_discrepancies_scanId_eventAt_id_idx"
  ON "billing_event_scan_discrepancies"("scanId", "eventAt", "id");
ALTER TABLE "billing_event_scan_discrepancies"
  ADD CONSTRAINT "billing_event_scan_discrepancies_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "billing_event_scans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
