CREATE TABLE "resume_parse_execution_claims" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "retryAuthorizedAttempt" INTEGER,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_parse_execution_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resume_parse_execution_claims_queueName_jobId_key"
    ON "resume_parse_execution_claims"("queueName", "jobId");

CREATE INDEX "resume_parse_execution_claims_resumeId_idx"
    ON "resume_parse_execution_claims"("resumeId");

ALTER TABLE "resume_parse_execution_claims"
    ADD CONSTRAINT "resume_parse_execution_claims_resumeId_fkey"
    FOREIGN KEY ("resumeId") REFERENCES "resumes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
