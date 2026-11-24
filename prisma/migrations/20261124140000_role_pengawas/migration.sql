-- Role Pengawas: hanya membaca Log aktivitas (izin audit.read). Aman dijalankan berulang.
INSERT INTO "Permission" ("id", "code")
SELECT gen_random_uuid()::text, 'audit.read'
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'audit.read');

INSERT INTO "Role" ("id", "tenantId", "code", "name", "isSuperadmin")
SELECT gen_random_uuid()::text, t."tenantId", 'PENGAWAS', 'Pengawas', false
FROM (SELECT DISTINCT "tenantId" FROM "Role") t
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."tenantId" = t."tenantId" AND r."code" = 'PENGAWAS');

-- Pengawas: audit.read + izin dasar. Superadmin menerima semua izin (audit.read ikut).
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."code" = 'PENGAWAS' AND p."code" IN ('audit.read', 'calendar.read', 'schedule.read-own'))
  OR (r."code" = 'SUPERADMIN' AND p."code" = 'audit.read')
)
ON CONFLICT DO NOTHING;
