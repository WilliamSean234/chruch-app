-- Verifikasi 2 langkah (TOTP) untuk akun Superadmin
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;
ALTER TABLE "User" ADD COLUMN "recoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];
