-- New coverage begins here. No historical event or aggregate is fabricated.
CREATE TYPE "BillingEvidenceComponent" AS ENUM ('stripe_fee', 'dispute_movement');
CREATE TYPE "BillingEvidenceState" AS ENUM ('pending', 'resolved_effect', 'resolved_zero', 'excluded_non_usd', 'excluded_pre_boundary', 'excluded_duplicate');
CREATE TYPE "AiCostIntentState" AS ENUM ('pending', 'costed', 'uncosted');
CREATE TYPE "AiCostEventKind" AS ENUM ('estimate', 'resolution');

CREATE TABLE "billing_combined_metrics_boundaries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "metricsStartAt" TIMESTAMP(3) NOT NULL,
  "captureActivatedAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "billing_combined_metrics_boundaries" ("id", "metricsStartAt", "currency")
VALUES ('combined_financial_v1', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'usd');

CREATE TABLE "ai_cost_metrics_boundaries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "metricsStartAt" TIMESTAMP(3) NOT NULL,
  "captureActivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "ai_cost_metrics_boundaries" ("id", "metricsStartAt")
VALUES ('estimated_ai_cost_v1', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE TABLE "billing_financial_evidence_cases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceStripeEventId" TEXT NOT NULL,
  "component" "BillingEvidenceComponent" NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerReference" TEXT,
  "state" "BillingEvidenceState" NOT NULL DEFAULT 'pending',
  "effectiveAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "fencingToken" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "billing_financial_evidence_cases_source_component_key"
  ON "billing_financial_evidence_cases" ("sourceStripeEventId", "component");
CREATE INDEX "billing_financial_evidence_cases_retry_idx"
  ON "billing_financial_evidence_cases" ("state", "nextAttemptAt", "leaseExpiresAt");
CREATE INDEX "billing_financial_evidence_cases_effective_idx"
  ON "billing_financial_evidence_cases" ("effectiveAt", "component");

CREATE TABLE "billing_evidence_resolutions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "state" "BillingEvidenceState" NOT NULL,
  "effectiveAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "billing_evidence_resolutions_case_state_key"
  ON "billing_evidence_resolutions" ("caseId", "state");
CREATE INDEX "billing_evidence_resolutions_case_created_idx"
  ON "billing_evidence_resolutions" ("caseId", "createdAt");
ALTER TABLE "billing_evidence_resolutions"
  ADD CONSTRAINT "billing_evidence_resolutions_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "billing_financial_evidence_cases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ai_cost_intents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" "AiCostIntentState" NOT NULL DEFAULT 'pending',
  "effectiveAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ai_cost_intents_state_started_idx" ON "ai_cost_intents" ("state", "startedAt");
CREATE INDEX "ai_cost_intents_effective_idx" ON "ai_cost_intents" ("effectiveAt");

CREATE TABLE "ai_cost_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "intentId" TEXT NOT NULL,
  "kind" "AiCostEventKind" NOT NULL,
  "estimatedMicroUsd" BIGINT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ai_cost_events_intent_kind_key" ON "ai_cost_events" ("intentId", "kind");
CREATE INDEX "ai_cost_events_effective_idx" ON "ai_cost_events" ("effectiveAt");
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_intentId_fkey"
  FOREIGN KEY ("intentId") REFERENCES "ai_cost_intents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ai_daily_cost_metrics" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "day" TIMESTAMP(3) NOT NULL,
  "estimatedMicroUsd" BIGINT NOT NULL DEFAULT 0,
  "costedRequestCount" INTEGER NOT NULL DEFAULT 0,
  "uncostedRequestCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ai_daily_cost_metrics_day_key" ON "ai_daily_cost_metrics" ("day");
