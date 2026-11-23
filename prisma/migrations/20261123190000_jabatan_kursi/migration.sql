-- AlterTable
ALTER TABLE "GroupPosition" ADD COLUMN "seats" INTEGER;

-- Jabatan yang selalu dipegang satu orang: Ketua, Sekretaris, Bendahara. Jabatan lain tetap tanpa batas.
UPDATE "GroupPosition" SET "seats" = 1 WHERE "deletedAt" IS NULL AND lower(trim("name")) IN ('ketua', 'sekretaris', 'bendahara');
