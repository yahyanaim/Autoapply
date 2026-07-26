ALTER TABLE "sessions" ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3);

UPDATE "sessions"
SET "absoluteExpiresAt" = "createdAt" + INTERVAL '8 hours';

ALTER TABLE "sessions"
ALTER COLUMN "absoluteExpiresAt" SET NOT NULL;
