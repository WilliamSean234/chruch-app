-- Setiap kelompok rapat wajib punya jabatan "Admin Tim" dengan akses penuh.

-- 1. Jabatan lama kelompok EBM dinaikkan di tempat (hanya bila kelompok itu belum punya "Admin Tim").
UPDATE "GroupPosition" gp
SET "name" = 'Admin Tim', "seats" = NULL, "deletedAt" = NULL,
    "canSchedule" = true, "canWriteMinutes" = true, "canFinalize" = true, "canManageMembers" = true
WHERE gp."name" = 'Admin Tim EBM' AND gp."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "GroupPosition" x WHERE x."groupId" = gp."groupId" AND x."name" = 'Admin Tim');

UPDATE "GroupPosition" gp
SET "name" = 'Admin Tim', "seats" = NULL, "deletedAt" = NULL,
    "canSchedule" = true, "canWriteMinutes" = true, "canFinalize" = true, "canManageMembers" = true
WHERE gp."name" = 'Penjadwal EBM' AND gp."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "GroupPosition" x WHERE x."groupId" = gp."groupId" AND x."name" = 'Admin Tim');

-- 2. Yang sudah bernama "Admin Tim": pastikan aktif dan berhak penuh.
UPDATE "GroupPosition"
SET "deletedAt" = NULL, "seats" = NULL,
    "canSchedule" = true, "canWriteMinutes" = true, "canFinalize" = true, "canManageMembers" = true
WHERE "name" = 'Admin Tim';

-- 3. Kelompok yang belum punya jabatan itu mendapatkannya.
INSERT INTO "GroupPosition" ("id", "groupId", "name", "sortOrder", "canSchedule", "canWriteMinutes", "canFinalize", "canManageMembers", "seats")
SELECT gen_random_uuid()::text, g."id", 'Admin Tim', 0, true, true, true, true, NULL
FROM "MeetingGroup" g
WHERE g."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "GroupPosition" x WHERE x."groupId" = g."id" AND x."name" = 'Admin Tim');
