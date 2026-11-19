/**
 * Data DUMMY untuk mencoba aplikasi (orang + akun per role).
 * Jalankan:  npm run db:seed:dummy      (setelah  npm run db:seed)
 * Aman diulang. JANGAN dijalankan di database produksi.
 * Di .env produksi, isi  DUMMY_SEED_BLOCK=1  supaya skrip ini menolak berjalan.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nameKey } from "../src/lib/names";

const prisma = new PrismaClient();
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const PASSWORD = "Dummy#1234";

type P = {
  name: string; title?: string; g: "L" | "P"; born: string; pos?: string; cg?: string;
  comm?: string[]; min: string[]; luar?: string;
};
const CG = ["CG Efata", "CG Betlehem", "CG Sion"];

const PEOPLE: P[] = [
  // Pimpinan ibadah
  { name: "Setia", g: "L", born: "1984-03-12", comm: ["Young couple"], min: ["PIC", "Liturgos (WL)"] },
  { name: "Maria", g: "P", born: "1986-07-02", comm: ["Young couple"], min: ["Liturgos (WL)"] },
  { name: "Rudy", g: "L", born: "1979-11-23", min: ["Liturgos (WL)", "PIC"] },
  { name: "Yohana", g: "P", born: "1990-01-30", min: ["PIC"] },
  { name: "Linda", g: "P", born: "1988-05-17", min: ["Liturgos (WL)"] },
  { name: "Pdt. Lukas", title: "Pdt.", g: "L", born: "1975-09-09", pos: "Pendeta", min: ["Pembicara"] },
  { name: "Ps. Chen", title: "Ps.", g: "L", born: "1980-04-04", pos: "Pembicara tamu", min: ["Pembicara"], luar: "GKI Pondok Indah" },
  // Pemusik
  { name: "Grace", g: "P", born: "1995-02-14", min: ["Keyboard"] },
  { name: "Joshua", g: "L", born: "1993-08-21", min: ["Piano", "Keyboard"] },
  { name: "Kevin", g: "L", born: "1996-06-06", min: ["Bass"] },
  { name: "William", g: "L", born: "2000-10-10", comm: ["Pemuda"], min: ["Drum", "Gitar", "Singer", "LCD"] },
  { name: "Daniel", g: "L", born: "1998-12-01", min: ["Drum"] },
  { name: "Anna", g: "P", born: "1997-03-03", min: ["Singer"] },
  { name: "Samuel", g: "L", born: "1994-09-19", min: ["Keyboard", "Piano"] },
  { name: "Nathan", g: "L", born: "2003-05-25", comm: ["Pemuda"], min: ["Gitar", "Kajon"] },
  { name: "Timothy", g: "L", born: "1999-07-07", min: ["Bass"] },
  { name: "Jonathan", g: "L", born: "2004-02-28", comm: ["Pemuda"], min: ["Drum", "Kajon"] },
  { name: "Priska", g: "P", born: "2002-11-11", comm: ["Pemuda"], min: ["Singer"] },
  { name: "Esther", g: "P", born: "1992-04-16", min: ["Piano"] },
  { name: "Jason", g: "L", born: "2001-01-20", comm: ["Pemuda"], min: ["Gitar", "Kajon"] },
  { name: "Vivian", g: "P", born: "2005-08-08", comm: ["Pemuda"], min: ["Singer"] },
  // EBM
  { name: "Michael", g: "L", born: "1991-06-30", min: ["LCD", "Multimedia"] },
  { name: "Rafael", g: "L", born: "1989-10-05", min: ["Sound"] },
  { name: "Evan", g: "L", born: "2002-03-15", comm: ["Pemuda"], min: ["Lighting", "Sound"] },
  { name: "Stefan", g: "L", born: "1995-12-12", min: ["LCD"] },
  { name: "Bryan", g: "L", born: "1997-09-23", min: ["Sound"] },
  { name: "Felix", g: "L", born: "2003-07-27", comm: ["Pemuda"], min: ["Lighting", "Multimedia"] },
  { name: "Kenny", g: "L", born: "2000-02-02", comm: ["Pemuda"], min: ["Sound", "LCD"] },
  // Usher, publikasi, petugas absen
  { name: "Lidia", g: "P", born: "1987-05-05", min: ["Usher"] },
  { name: "Hana", g: "P", born: "2004-06-18", comm: ["Pemuda"], min: ["Usher", "Desain e-flyer"] },
  { name: "Ruth", g: "P", born: "1990-10-22", min: ["Usher"] },
  { name: "Naomi", g: "P", born: "2005-01-09", comm: ["Pemuda"], min: ["Usher", "Desain e-flyer"] },
  { name: "Yusuf", g: "L", born: "1985-08-14", min: ["Usher"] },
  { name: "Debora", g: "P", born: "2001-04-03", comm: ["Pemuda"], min: [] },
];

const ACCOUNTS: { email: string; person: string; role: "PENJADWAL" | "ADMIN_TIM" | "PETUGAS_ABSEN" | "PELAYAN"; team?: string }[] = [
  { email: "penjadwal@dummy.local", person: "Ruth", role: "PENJADWAL" },
  { email: "admin.pemusik@dummy.local", person: "Grace", role: "ADMIN_TIM", team: "Tim pemusik" },
  { email: "admin.ebm@dummy.local", person: "Michael", role: "ADMIN_TIM", team: "Tim EBM" },
  { email: "absen@dummy.local", person: "Debora", role: "PETUGAS_ABSEN" },
  { email: "pelayan@dummy.local", person: "William", role: "PELAYAN" },
];

async function main() {
  if (process.env.DUMMY_SEED_BLOCK === "1") throw new Error("DUMMY_SEED_BLOCK=1: seed dummy ditolak di lingkungan ini.");
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://x/x");
  console.log(`Mengisi DATA DUMMY ke database: ${url.host}${url.pathname}`);

  const ministries = await prisma.ministry.findMany({ where: { tenantId: TENANT_ID, deletedAt: null } });
  if (!ministries.length) throw new Error("Data awal belum ada. Jalankan dulu: npm run db:seed");
  const minId = new Map(ministries.map((m) => [m.name, m.id]));
  const positions = new Map((await prisma.personPosition.findMany({ where: { tenantId: TENANT_ID } })).map((p) => [p.name, p.id]));
  const communities = new Map((await prisma.community.findMany({ where: { tenantId: TENANT_ID } })).map((c) => [c.name, c.id]));
  const jemaat = positions.get("Jemaat")!;

  const cgId = new Map<string, string>();
  for (const name of CG) {
    const row = await prisma.cgGroup.upsert({ where: { tenantId_name: { tenantId: TENANT_ID, name } }, update: { deletedAt: null }, create: { tenantId: TENANT_ID, name } });
    cgId.set(name, row.id);
  }

  const personId = new Map<string, string>();
  let made = 0;
  for (const [i, p] of PEOPLE.entries()) {
    const key = nameKey(p.name);
    let row = await prisma.person.findFirst({ where: { tenantId: TENANT_ID, nameKey: key, deletedAt: null } });
    if (!row) {
      row = await prisma.person.create({
        data: {
          tenantId: TENANT_ID, name: p.name, nameKey: key, title: p.title ?? null, birthDate: new Date(`${p.born}T00:00:00.000Z`), gender: p.g,
          positionId: (p.pos && positions.get(p.pos)) || jemaat, cgGroupId: cgId.get(CG[i % CG.length])!,
          origin: p.luar ? "LUAR" : "DALAM", originChurch: p.luar ?? null,
        },
      });
      made++;
    }
    personId.set(p.name, row.id);
    const mids = p.min.map((m) => {
      const id = minId.get(m);
      if (!id) throw new Error(`Posisi "${m}" tidak ada. Jalankan ulang: npm run db:seed`);
      return id;
    });
    if (mids.length) await prisma.personMinistry.createMany({ data: mids.map((ministryId) => ({ personId: row!.id, ministryId })), skipDuplicates: true });
    const cids = (p.comm ?? []).map((c) => communities.get(c)).filter((x): x is string => !!x);
    if (cids.length) await prisma.personCommunity.createMany({ data: cids.map((communityId) => ({ personId: row!.id, communityId })), skipDuplicates: true });
  }
  console.log(`Orang: ${made} baru dari ${PEOPLE.length} data dummy.`);

  const roles = new Map((await prisma.role.findMany({ where: { tenantId: TENANT_ID } })).map((r) => [r.code, r.id]));
  const teams = new Map((await prisma.teamType.findMany({ where: { tenantId: TENANT_ID } })).map((t) => [t.name, t.id]));
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const a of ACCOUNTS) {
    const exists = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: TENANT_ID, email: a.email } } });
    if (exists) continue;
    await prisma.user.create({
      data: {
        tenantId: TENANT_ID, email: a.email, passwordHash: hash, personId: personId.get(a.person)!,
        roles: { create: [{ roleId: roles.get(a.role)!, teamTypeId: a.team ? teams.get(a.team)! : null }] },
      },
    });
  }

  console.log("\nAkun dummy (kata sandi semuanya: " + PASSWORD + ")");
  for (const a of ACCOUNTS) console.log(`  ${a.role.padEnd(14)} ${a.email.padEnd(28)} ${a.person}${a.team ? ` (${a.team})` : ""}`);
  console.log("  SUPERADMIN     (sesuai SEED_ADMIN_EMAIL di .env)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
