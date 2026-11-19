/**
 * Seed awal (idempotent): bisa dijalankan berulang kali.
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

// ───────── Permission & role ─────────
const PERMISSIONS = [
  "user.manage",
  "master.write", // TeamType, Ministry, Room, lookup
  "person.write",
  "template.write", // hanya Superadmin
  "event.write",
  "assignment.write",
  "rehearsal.write",
  "event.publish",
  "booking.override", // hanya Superadmin
  "calendar.read",
  "schedule.read-own",
] as const;

const ROLES: { code: string; name: string; isSuperadmin?: boolean; permissions: string[] }[] = [
  { code: "SUPERADMIN", name: "Superadmin", isSuperadmin: true, permissions: [...PERMISSIONS] },
  {
    code: "PENJADWAL",
    name: "Penjadwal",
    permissions: [
      "master.write",
      "person.write",
      "event.write",
      "assignment.write",
      "rehearsal.write",
      "event.publish",
      "calendar.read",
      "schedule.read-own",
    ],
  },
  {
    // permission dibatasi ke TeamType lewat UserRole.teamTypeId
    code: "ADMIN_TIM",
    name: "Admin Tim",
    permissions: ["person.write", "assignment.write", "rehearsal.write", "calendar.read", "schedule.read-own"],
  },
  { code: "PELAYAN", name: "Pelayan", permissions: ["calendar.read", "schedule.read-own"] },
];

// ───────── Tim paten & posisi ─────────
// Posisi dengan lebih dari satu kursi (Gitar 1, Lighting 2, Usher 3) memakai slotNo pada penugasan.
const TEAMS: { name: string; ministries: { name: string; rehearsalRequired?: boolean }[] }[] = [
  {
    name: "Pimpinan ibadah",
    ministries: [{ name: "PIC" }, { name: "Liturgos (WL)", rehearsalRequired: true }, { name: "Pembicara" }],
  },
  {
    name: "Tim pemusik",
    ministries: ["Keyboard", "Piano", "PSR", "Bass", "Gitar", "Drum", "Singer"].map((name) => ({
      name,
      rehearsalRequired: true,
    })),
  },
  { name: "Tim EBM", ministries: [{ name: "LCD" }, { name: "Sound" }, { name: "Lighting" }] },
  { name: "Usher", ministries: [{ name: "Usher" }] },
];

const ROOMS = ["Ruang A", "Ruang B", "Ruang C"];
const POSITIONS = ["Jemaat", "Pembina pemuda", "Pembina remaja", "Pengurus pemuda", "Pendeta", "Pembicara tamu"];
const COMMUNITIES = ["Pemuda", "Young couple", "Anak-anak"];

// ───────── Template acara awal ─────────
type SlotDef = [ministry: string, slotNo: number];
const FULL: SlotDef[] = [
  ["PIC", 1], ["Liturgos (WL)", 1], ["Pembicara", 1],
  ["Keyboard", 1], ["Piano", 1], ["Bass", 1], ["Gitar", 1], ["Drum", 1], ["Singer", 1],
  ["LCD", 1], ["Sound", 1], ["Lighting", 1], ["Lighting", 2],
  ["Usher", 1], ["Usher", 2], ["Usher", 3],
];
const MANDARIN: SlotDef[] = [
  ["PIC", 1], ["Liturgos (WL)", 1], ["Pembicara", 1],
  ["Piano", 1], ["Gitar", 1], ["Singer", 1],
  ["LCD", 1], ["Sound", 1],
  ["Usher", 1],
];
const TEMPLATES: { name: string; startTime: string; room: string; slots: SlotDef[] }[] = [
  { name: "Ibadah Minggu I", startTime: "07:00", room: "Ruang A", slots: FULL },
  { name: "Ibadah Minggu II", startTime: "09:30", room: "Ruang A", slots: FULL },
  { name: "Ibadah Mandarin", startTime: "09:30", room: "Ruang B", slots: MANDARIN },
];

async function main() {
  // Tenant
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Gereja" },
  });

  // Permission
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }

  // Role + RolePermission
  const roleIds: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: TENANT_ID, code: r.code } },
      update: { name: r.name, isSuperadmin: !!r.isSuperadmin },
      create: { tenantId: TENANT_ID, code: r.code, name: r.name, isSuperadmin: !!r.isSuperadmin },
    });
    roleIds[r.code] = role.id;
    const perms = await prisma.permission.findMany({ where: { code: { in: r.permissions } } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // Superadmin pertama
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: TENANT_ID, email } },
      update: {},
      create: { tenantId: TENANT_ID, email, passwordHash },
    });
    const existing = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: roleIds.SUPERADMIN, teamTypeId: null },
    });
    if (!existing) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleIds.SUPERADMIN } });
    }
  } else {
    console.warn("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD belum diisi: akun Superadmin dilewati.");
  }

  // Tim paten + posisi
  const ministryIds: Record<string, string> = {};
  let teamOrder = 0;
  for (const t of TEAMS) {
    const team = await prisma.teamType.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name: t.name } },
      update: { isCore: true, sortOrder: teamOrder },
      create: { tenantId: TENANT_ID, name: t.name, isCore: true, sortOrder: teamOrder },
    });
    teamOrder += 1;
    let order = 0;
    for (const m of t.ministries) {
      const ministry = await prisma.ministry.upsert({
        where: { tenantId_teamTypeId_name: { tenantId: TENANT_ID, teamTypeId: team.id, name: m.name } },
        update: { rehearsalRequiredDefault: !!m.rehearsalRequired, sortOrder: order },
        create: {
          tenantId: TENANT_ID,
          teamTypeId: team.id,
          name: m.name,
          rehearsalRequiredDefault: !!m.rehearsalRequired,
          sortOrder: order,
        },
      });
      ministryIds[m.name] = ministry.id;
      order += 1;
    }
  }

  // Ruangan
  const roomIds: Record<string, string> = {};
  for (const name of ROOMS) {
    const room = await prisma.room.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name } },
      update: {},
      create: { tenantId: TENANT_ID, name },
    });
    roomIds[name] = room.id;
  }

  // Lookup orang
  let posOrder = 0;
  for (const name of POSITIONS) {
    await prisma.personPosition.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name } },
      update: {},
      create: { tenantId: TENANT_ID, name, sortOrder: posOrder },
    });
    posOrder += 1;
  }
  for (const name of COMMUNITIES) {
    await prisma.community.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name } },
      update: {},
      create: { tenantId: TENANT_ID, name },
    });
  }

  // Template acara + slot bawaan (wajib latihan mengikuti default posisi)
  const defaults = await prisma.ministry.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, rehearsalRequiredDefault: true },
  });
  const reqById = new Map(defaults.map((d) => [d.id, d.rehearsalRequiredDefault]));

  for (const tpl of TEMPLATES) {
    const template = await prisma.eventTemplate.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name: tpl.name } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        name: tpl.name,
        weekday: 0,
        startTime: tpl.startTime,
        durationMin: 120,
        roomId: roomIds[tpl.room],
      },
    });
    for (const [ministryName, slotNo] of tpl.slots) {
      const ministryId = ministryIds[ministryName];
      await prisma.eventTemplateSlot.upsert({
        where: { templateId_ministryId_slotNo: { templateId: template.id, ministryId, slotNo } },
        update: {},
        create: {
          templateId: template.id,
          ministryId,
          slotNo,
          rehearsalRequired: reqById.get(ministryId) ?? false,
        },
      });
    }
  }

  console.log("Seed selesai.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
