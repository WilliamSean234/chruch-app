/**
 * Kelompok rapat DUMMY (Majelis, Pengurus Pemuda, ...) untuk mencoba modul Rapat.
 * Jalankan:  npm run db:seed:groups      (setelah db:seed dan db:seed:dummy)
 * Aman diulang: kelompok/jabatan yang sudah ada dilewati, anggota hanya ditambah bila belum ada.
 * JANGAN dijalankan di produksi (ikut aturan DUMMY_SEED_BLOCK).
 */
import { PrismaClient } from "@prisma/client";
import { nameKey } from "../src/lib/names";

const prisma = new PrismaClient();
const TENANT_ID = "00000000-0000-4000-8000-000000000001";

// hak: [jadwalkan, tulis notulen, finalkan, kelola anggota]
type Pos = { name: string; caps: [boolean, boolean, boolean, boolean] };
const KETUA: Pos = { name: "Ketua", caps: [false, false, true, true] };
const SEKRETARIS: Pos = { name: "Sekretaris", caps: [true, true, true, false] };
const PENJADWAL: Pos = { name: "Penjadwal", caps: [true, false, false, false] };
const BENDAHARA: Pos = { name: "Bendahara", caps: [false, false, false, false] };
const ANGGOTA: Pos = { name: "Anggota", caps: [false, false, false, false] };

const GROUPS: { name: string; quorumMin: number | null; positions: Pos[]; members: [string, string[]][] }[] = [
  { name: "Majelis", quorumMin: 50, positions: [KETUA, SEKRETARIS, PENJADWAL, BENDAHARA, ANGGOTA],
    members: [["Pdt. Lukas", ["Ketua"]], ["Setia", ["Sekretaris", "Penjadwal"]], ["Rudy", ["Bendahara"]], ["Linda", ["Anggota"]], ["Yohana", ["Anggota"]], ["Samuel", ["Anggota"]]] },
  { name: "Pengurus Pemuda", quorumMin: 50, positions: [KETUA, SEKRETARIS, PENJADWAL, BENDAHARA, ANGGOTA],
    members: [["William", ["Ketua"]], ["Maria", ["Sekretaris", "Penjadwal"]], ["Daniel", ["Bendahara"]], ["Grace", ["Anggota"]], ["Kevin", ["Anggota"]], ["Joshua", ["Anggota"]], ["Anna", ["Anggota"]]] },
  { name: "Pengurus Remaja", quorumMin: null, positions: [KETUA, SEKRETARIS, ANGGOTA], members: [] },
  { name: "Pengurus Rayon", quorumMin: null, positions: [{ name: "Koordinator", caps: [true, false, true, true] }, SEKRETARIS, ANGGOTA], members: [] },
  { name: "Hamba Tuhan", quorumMin: null, positions: [{ name: "Gembala sidang", caps: [true, false, true, true] }, SEKRETARIS, ANGGOTA], members: [] },
  { name: "Tim EBM", quorumMin: null, positions: [{ name: "Koordinator", caps: [true, true, true, true] }, ANGGOTA], members: [] },
];

async function main() {
  if (process.env.DUMMY_SEED_BLOCK === "1") throw new Error("DUMMY_SEED_BLOCK=1: seed dummy ditolak di lingkungan ini.");
  let order = 0;
  for (const g of GROUPS) {
    order++;
    const group =
      (await prisma.meetingGroup.findFirst({ where: { tenantId: TENANT_ID, name: g.name } })) ??
      (await prisma.meetingGroup.create({ data: { tenantId: TENANT_ID, name: g.name, quorumMin: g.quorumMin, sortOrder: order } }));
    const posId = new Map<string, string>();
    let pi = 0;
    for (const p of g.positions) {
      pi++;
      const row =
        (await prisma.groupPosition.findFirst({ where: { groupId: group.id, name: p.name } })) ??
        (await prisma.groupPosition.create({
          data: { groupId: group.id, name: p.name, sortOrder: p.name === "Anggota" ? 99 : pi, canSchedule: p.caps[0], canWriteMinutes: p.caps[1], canFinalize: p.caps[2], canManageMembers: p.caps[3] },
        }));
      posId.set(p.name, row.id);
    }
    for (const [personName, posNames] of g.members) {
      const person = await prisma.person.findFirst({ where: { tenantId: TENANT_ID, nameKey: nameKey(personName), deletedAt: null } });
      if (!person) { console.log(`  lewati ${personName}: belum ada di data orang (jalankan db:seed:dummy dulu)`); continue; }
      const exists = await prisma.groupMember.findUnique({ where: { groupId_personId: { groupId: group.id, personId: person.id } } });
      if (exists) continue;
      const m = await prisma.groupMember.create({ data: { groupId: group.id, personId: person.id } });
      await prisma.groupMemberPosition.createMany({ data: posNames.map((n) => ({ memberId: m.id, positionId: posId.get(n)! })) });
    }
    console.log(`Kelompok ${g.name}: ${g.positions.length} jabatan, ${g.members.length} anggota contoh`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
