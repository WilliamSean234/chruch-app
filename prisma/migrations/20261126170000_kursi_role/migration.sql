-- Batas jumlah akun aktif per role (kursi), diatur Superadmin utama. Kosong = tanpa batas.
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "maxAccounts" INTEGER;
