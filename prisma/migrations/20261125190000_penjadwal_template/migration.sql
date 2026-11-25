-- Penjadwal juga boleh membuat dan mengubah template acara (izin template.write, sebelumnya hanya Superadmin).
-- Aman dijalankan berulang. Pengguna harus keluar lalu masuk lagi supaya izin barunya terbaca.
INSERT INTO "Permission" ("id", "code")
SELECT gen_random_uuid()::text, 'template.write'
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'template.write');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'template.write'
WHERE r."code" = 'PENJADWAL'
ON CONFLICT DO NOTHING;
