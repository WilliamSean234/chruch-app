/**
 * Rapat DUMMY untuk mencoba modul Rapat: puluhan rapat di beberapa kelompok, sebagian sudah lewat, sebagian akan datang,
 * beberapa dibatalkan, beberapa dengan topik tampil di kalender dan tautan lampiran. Ruangan berlantai ikut dibuat
 * (301A, 301B = lantai 3; 401A, 401B = lantai 4) supaya filter lantai bisa dicoba.
 *
 * Jalankan:  npm run db:seed:meetings      (setelah db:seed, db:seed:dummy, dan db:seed:groups)
 * Aman diulang: rapat yang sudah ada (kelompok + waktu mulai sama) dilewati; ruangan yang bentrok dilewati.
 * Tanggalnya relatif terhadap hari ini: kira-kira 14 pekan ke belakang dan 13 pekan ke depan.
 * JANGAN dijalankan di produksi (ikut aturan DUMMY_SEED_BLOCK).
 */
import { PrismaClient } from "@prisma/client";
import { nextDocNumber } from "../src/lib/docNumber";
import { eachDate, localParts, zonedToUtc } from "../src/lib/time";

const prisma = new PrismaClient();
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const DAY = 86_400_000;
const PAST_DAYS = 100;
const FUTURE_DAYS = 90;

// Ruangan berlantai. Ruang A/B/C bawaan diberi lantai bila masih kosong, agar filter lantai punya isi.
const NEW_ROOMS: [name: string, floor: number][] = [["301A", 3], ["301B", 3], ["401A", 4], ["401B", 4]];
const OLD_ROOM_FLOORS: Record<string, number> = { "Ruang A": 1, "Ruang B": 1, "Ruang C": 2 };

type Plan = { group: string; weekday: number; start: string; end: string; room: string; everyWeeks: number; shift: number; titles: string[] };
const PLANS: Plan[] = [
  { group: "Majelis", weekday: 4, start: "19:00", end: "21:00", room: "401A", everyWeeks: 2, shift: 0,
    titles: ["Evaluasi pelayanan bulanan", "Perencanaan ibadah Natal", "Pembahasan anggaran gereja", "Penggembalaan jemaat", "Persiapan Sidang Majelis", "Rencana kunjungan pastoral", "Pembinaan para pelayan"] },
  { group: "Pengurus Pemuda", weekday: 6, start: "14:00", end: "16:00", room: "301A", everyWeeks: 2, shift: 1,
    titles: ["Evaluasi Fellowship", "Perencanaan retreat pemuda", "Pembagian tugas Natal", "Koordinasi tim musik", "Program bakti sosial", "Pendataan anggota baru"] },
  { group: "Pengurus Remaja", weekday: 5, start: "19:00", end: "20:30", room: "301B", everyWeeks: 3, shift: 0,
    titles: ["Rencana kegiatan remaja", "Evaluasi ibadah remaja", "Persiapan camp", "Pembagian pembina"] },
  { group: "Pengurus Rayon", weekday: 3, start: "19:30", end: "21:00", room: "301B", everyWeeks: 4, shift: 1,
    titles: ["Koordinasi kunjungan rayon", "Evaluasi persekutuan rayon", "Rencana doa bersama"] },
  { group: "Hamba Tuhan", weekday: 2, start: "10:00", end: "11:30", room: "401B", everyWeeks: 1, shift: 0,
    titles: ["Rapat mingguan hamba Tuhan", "Penyusunan tema khotbah", "Rencana pelayanan Natal", "Evaluasi pelayanan pastoral"] },
  { group: "Tim EBM", weekday: 1, start: "19:00", end: "20:30", room: "401B", everyWeeks: 2, shift: 1,
    titles: ["Koordinasi jadwal tim EBM", "Evaluasi pelayanan EBM", "Persiapan ibadah khusus"] },
];

const LINKS = [
  ["Agenda rapat", "https://docs.google.com/document/d/dummy-agenda"],
  ["Bahan presentasi", "https://drive.google.com/file/d/dummy-bahan"],
  ["Laporan keuangan", "https://docs.google.com/spreadsheets/d/dummy-laporan"],
];

async function main() {
  if (process.env.DUMMY_SEED_BLOCK === "1") throw new Error("DUMMY_SEED_BLOCK=1: seed dummy ditolak di lingkungan ini.");

  // Ruangan berlantai
  for (const [name, floor] of NEW_ROOMS) {
    const room = await prisma.room.findUnique({ where: { tenantId_name: { tenantId: TENANT_ID, name } } });
    if (!room) await prisma.room.create({ data: { tenantId: TENANT_ID, name, floor } });
    else if (room.floor === null || room.deletedAt) await prisma.room.update({ where: { id: room.id }, data: { floor: room.floor ?? floor, deletedAt: null, isActive: true } });
  }
  for (const [name, floor] of Object.entries(OLD_ROOM_FLOORS)) {
    await prisma.room.updateMany({ where: { tenantId: TENANT_ID, name, floor: null }, data: { floor } });
  }
  const rooms = new Map((await prisma.room.findMany({ where: { tenantId: TENANT_ID, deletedAt: null } })).map((r) => [r.name, r.id]));

  const today = localParts(new Date()).date;
  const from = localParts(new Date(Date.now() - PAST_DAYS * DAY)).date;
  const to = localParts(new Date(Date.now() + FUTURE_DAYS * DAY)).date;
  const days = [...eachDate(from, to)];

  let made = 0, skipped = 0, cancelled = 0, linked = 0;
  for (const plan of PLANS) {
    const group = await prisma.meetingGroup.findFirst({ where: { tenantId: TENANT_ID, name: plan.group, deletedAt: null } });
    const roomId = rooms.get(plan.room);
    if (!group || !roomId) { console.log(`Lewati ${plan.group}: kelompok atau ruangan ${plan.room} belum ada (jalankan db:seed:groups dulu).`); continue; }

    // pembuat: anggota berjabatan penjadwal yang punya akun login (bila ada)
    const scheduler = await prisma.groupMember.findFirst({
      where: { groupId: group.id, leftAt: null, positions: { some: { position: { canSchedule: true, deletedAt: null } } }, person: { user: { isNot: null } } },
      include: { person: { include: { user: true } } },
    });
    const createdById = scheduler?.person.user?.id ?? null;

    const matching = days.filter((d) => d.weekday === plan.weekday);
    let idx = 0;
    for (let i = plan.shift; i < matching.length; i += plan.everyWeeks, idx++) {
      const date = matching[i]!.iso;
      const startsAt = zonedToUtc(date, plan.start);
      const endsAt = zonedToUtc(date, plan.end);
      const title = plan.titles[idx % plan.titles.length]!;

      if (await prisma.event.findFirst({ where: { tenantId: TENANT_ID, kind: "RAPAT", groupId: group.id, startsAt, deletedAt: null } })) { skipped++; continue; }

      // sebagian dibatalkan (yang akan datang jarang, yang lampau lebih sering)
      const isCancelled = idx % 9 === 4 || (date > today && idx % 11 === 6);
      const clash = !isCancelled && (await prisma.booking.findFirst({ where: { tenantId: TENANT_ID, resourceType: "ROOM", resourceId: roomId, deletedAt: null, isOverride: false, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } }));
      if (clash) { skipped++; continue; }

      const number = await nextDocNumber(TENANT_ID, "RP", startsAt, prisma);
      const event = await prisma.event.create({
        data: {
          tenantId: TENANT_ID, number, kind: "RAPAT", groupId: group.id, title, startsAt, endsAt, roomId,
          status: isCancelled ? "CANCELLED" : "PUBLISHED", publishedAt: new Date(), attendanceMode: "COUNT", createdById,
          cancelReason: isCancelled ? (idx % 2 ? "Banyak anggota berhalangan, diundur" : "Bentrok dengan acara gereja lain") : null,
          showTopic: idx % 4 === 0, showAttendees: false,
        },
      });
      if (isCancelled) cancelled++;
      else {
        await prisma.booking.create({ data: { tenantId: TENANT_ID, resourceType: "ROOM", resourceId: roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: event.id } });
        if (idx % 3 === 0) {
          const [lt, lu] = LINKS[idx % LINKS.length]!;
          await prisma.meetingLink.create({ data: { eventId: event.id, title: lt, url: lu, createdById } });
          linked++;
        }
      }
      made++;
    }
    console.log(`Rapat ${plan.group}: ${plan.room}, tiap ${plan.everyWeeks} pekan`);
  }
  // Peserta: setiap rapat yang belum punya daftar peserta mengundang seluruh anggota aktif kelompoknya.
  // Rapat yang sudah lewat diberi catatan kehadiran (sekitar 70% hadir, sisanya izin atau tidak hadir); yang akan datang atau dibatalkan tetap "belum dicatat".
  const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const GUESTS = ["Bpk. Daniel (narasumber)", "Ibu Maria (pembina)", "Pdt. Samuel (tamu)"];
  const bare = await prisma.event.findMany({
    where: { tenantId: TENANT_ID, kind: "RAPAT", deletedAt: null, groupId: { not: null }, participants: { none: {} } },
    select: { id: true, groupId: true, status: true, endsAt: true },
  });
  type Row = { eventId: string; personId: string | null; guestName?: string; status: string; respondedAt: Date | null };
  const memberCache = new Map<string, string[]>();
  let invitedRows = 0;
  const now = Date.now();
  for (const ev of bare) {
    const gid = ev.groupId!;
    if (!memberCache.has(gid)) {
      memberCache.set(gid, (await prisma.groupMember.findMany({ where: { groupId: gid, leftAt: null, person: { deletedAt: null } }, select: { personId: true } })).map((m) => m.personId));
    }
    const past = ev.status === "PUBLISHED" && ev.endsAt.getTime() < now;
    const rows: Row[] = memberCache.get(gid)!.map((personId) => {
      const r = hash(ev.id + personId) % 100;
      const status = !past ? "INVITED" : r < 70 ? "PRESENT" : r < 85 ? "EXCUSED" : "ABSENT";
      return { eventId: ev.id, personId, status, respondedAt: status === "INVITED" ? null : ev.endsAt };
    });
    if (hash(ev.id) % 5 === 0) {
      const g = GUESTS[hash(ev.id) % GUESTS.length]!;
      rows.push({ eventId: ev.id, personId: null, guestName: g, status: past ? "PRESENT" : "INVITED", respondedAt: past ? ev.endsAt : null });
    }
    if (rows.length) { await prisma.meetingParticipant.createMany({ data: rows }); invitedRows += rows.length; }
  }
  console.log(`Peserta: ${invitedRows} undangan dibuat untuk ${bare.length} rapat yang belum punya daftar peserta.`);

  // Notulen contoh: rapat lampau yang sudah terbit dan belum punya notulen (~60% Final, ~15% Draf, sisanya kosong).
  const past = await prisma.event.findMany({
    where: { tenantId: TENANT_ID, kind: "RAPAT", deletedAt: null, status: "PUBLISHED", groupId: { not: null }, endsAt: { lt: new Date() }, minutes: null },
    select: { id: true, title: true, endsAt: true },
    take: 60,
  });
  let minutesMade = 0;
  for (const ev of past) {
    const r = hash(ev.id + "notulen") % 100;
    if (r >= 75) continue;
    const final = r < 60;
    await prisma.meetingMinutes.create({
      data: {
        eventId: ev.id,
        status: final ? "FINAL" : "DRAFT",
        version: 1,
        agenda: "1. Pembukaan dan doa\n2. Evaluasi pelayanan bulan lalu\n3. Rencana kegiatan bulan depan",
        discussion: "Evaluasi: pelayanan berjalan baik, kehadiran relawan perlu ditingkatkan.\nTindak lanjut: pengurus menghubungi relawan yang belum aktif sebelum akhir bulan.",
        decisions: "Jadwal pelayanan bulan depan disetujui.\nRapat berikutnya dilaksanakan bulan depan di ruang yang sama.",
        draftAt: ev.endsAt,
        finalizedAt: final ? ev.endsAt : null,
        ...(final ? { revisions: { create: { version: 1, agenda: "1. Pembukaan dan doa\n2. Evaluasi pelayanan bulan lalu\n3. Rencana kegiatan bulan depan", discussion: "Evaluasi: pelayanan berjalan baik, kehadiran relawan perlu ditingkatkan.\nTindak lanjut: pengurus menghubungi relawan yang belum aktif sebelum akhir bulan.", decisions: "Jadwal pelayanan bulan depan disetujui.\nRapat berikutnya dilaksanakan bulan depan di ruang yang sama.", draftAt: ev.endsAt, finalizedAt: ev.endsAt } } } : {}),
      },
    });
    minutesMade++;
  }
  console.log(`Notulen: ${minutesMade} notulen contoh dibuat.`);

  console.log(`Selesai: ${made} rapat dibuat (${cancelled} dibatalkan, ${linked} dengan tautan), ${skipped} dilewati karena sudah ada atau ruangan bentrok.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
