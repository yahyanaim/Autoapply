CREATE TABLE "beta_registration_gate" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beta_registration_gate_pkey" PRIMARY KEY ("id")
);

INSERT INTO "beta_registration_gate" ("id", "count", "updatedAt")
VALUES ('singleton', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
