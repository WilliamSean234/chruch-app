-- Sesi yang dibuat sebelum kata sandi diganti atau direset admin tidak berlaku lagi.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsValidFrom" TIMESTAMP(3);
