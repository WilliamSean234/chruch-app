-- Superadmin utama (pemilik): akunnya tidak bisa diubah oleh Superadmin lain
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;
-- Akun yang sudah ada: Superadmin pertama (admin@prod.com) ditandai sebagai pemilik. Cek atau ganti dengan npm run db:set-owner.
UPDATE "User" SET "isOwner" = true WHERE lower("email") = 'admin@prod.com' AND "deletedAt" IS NULL;
