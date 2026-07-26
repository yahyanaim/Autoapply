CREATE TABLE "extension_auth_handoffs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "extension_auth_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "extension_auth_handoffs_codeHash_key"
ON "extension_auth_handoffs"("codeHash");

CREATE INDEX "extension_auth_handoffs_userId_idx"
ON "extension_auth_handoffs"("userId");

CREATE INDEX "extension_auth_handoffs_expiresAt_idx"
ON "extension_auth_handoffs"("expiresAt");

ALTER TABLE "extension_auth_handoffs"
ADD CONSTRAINT "extension_auth_handoffs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
