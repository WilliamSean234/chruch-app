-- Role Admin Jemaat: khusus tambah dan ubah data jemaat (izin baru person.manage).
-- Penjadwal tidak lagi boleh mengubah master data (master.write: tim, posisi, ruangan, daftar pilihan) dan tidak boleh menambah/mengubah identitas orang.
-- Aman dijalankan berulang. Pengguna harus keluar lalu masuk lagi supaya izin barunya terbaca.
INSERT INTO "Permission" ("id", "code")
SELECT gen_random_uuid()::text, 'person.manage'
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'person.manage');

INSERT INTO "Role" ("id", "tenantId", "code", "name", "isSuperadmin")
SELECT gen_random_uuid()::text, t."tenantId", 'ADMIN_JEMAAT', 'Admin Jemaat', false
FROM (SELECT DISTINCT "tenantId" FROM "Role") t
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."tenantId" = t."tenantId" AND r."code" = 'ADMIN_JEMAAT');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."code" = 'ADMIN_JEMAAT' AND p."code" IN ('person.write', 'person.manage', 'calendar.read', 'schedule.read-own'))
  OR (r."code" = 'SUPERADMIN' AND p."code" = 'person.manage')
)
ON CONFLICT DO NOTHING;

DELETE FROM "RolePermission"
WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "code" = 'PENJADWAL')
  AND "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" = 'master.write');
