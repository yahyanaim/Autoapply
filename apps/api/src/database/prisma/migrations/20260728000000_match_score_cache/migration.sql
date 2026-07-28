CREATE TABLE "match_score_cache" (
  "id" TEXT NOT NULL,
  "resumeId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "algorithmVersion" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "matchedKeywords" TEXT[] NOT NULL,
  "missingKeywords" TEXT[] NOT NULL,
  "weakSections" TEXT[] NOT NULL,
  "breakdown" JSONB NOT NULL,
  "explanation" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "match_score_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_score_cache_inputHash_key"
  ON "match_score_cache"("inputHash");

CREATE INDEX "match_score_cache_resumeId_idx"
  ON "match_score_cache"("resumeId");

ALTER TABLE "match_score_cache"
  ADD CONSTRAINT "match_score_cache_resumeId_fkey"
  FOREIGN KEY ("resumeId") REFERENCES "resumes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
