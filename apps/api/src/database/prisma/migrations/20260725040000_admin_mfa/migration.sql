ALTER TABLE "users"
ADD COLUMN "mfaSecretEncrypted" TEXT,
ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);

ALTER TABLE "sessions"
ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
