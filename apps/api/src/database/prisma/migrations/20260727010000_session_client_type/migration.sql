CREATE TYPE "SessionClientType" AS ENUM ('web', 'extension');

ALTER TABLE "sessions"
ADD COLUMN "clientType" "SessionClientType" NOT NULL DEFAULT 'web';
