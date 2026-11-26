-- Jabatan wajib "Admin Tim" di kelompok rapat diganti namanya menjadi "Pengelola Kelompok" (hak dan pemegangnya tidak berubah).
-- Alasan: tidak tertukar dengan role Admin Tim, pengelola satu tim pelayanan. Aman diulang.

-- Ganti nama di tempat, kecuali kelompok yang sudah punya jabatan bernama "Pengelola Kelompok" (nama jabatan unik per kelompok).
UPDATE "GroupPosition" gp
SET "name" = 'Pengelola Kelompok'
WHERE gp."name" = 'Admin Tim'
  AND NOT EXISTS (SELECT 1 FROM "GroupPosition" x WHERE x."groupId" = gp."groupId" AND x."name" = 'Pengelola Kelompok');

-- Yang sudah bernama "Pengelola Kelompok": pastikan aktif dan berhak penuh.
UPDATE "GroupPosition"
SET "deletedAt" = NULL, "seats" = NULL,
    "canSchedule" = true, "canWriteMinutes" = true, "canFinalize" = true, "canManageMembers" = true
WHERE "name" = 'Pengelola Kelompok';

-- Kelompok yang belum punya jabatan itu mendapatkannya.
INSERT INTO "GroupPosition" ("id", "groupId", "name", "sortOrder", "canSchedule", "canWriteMinutes", "canFinalize", "canManageMembers", "seats")
SELECT gen_random_uuid()::text, g."id", 'Pengelola Kelompok', 0, true, true, true, true, NULL
FROM "MeetingGroup" g
WHERE g."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "GroupPosition" x WHERE x."groupId" = g."id" AND x."name" = 'Pengelola Kelompok');
