import { audit } from "../audit";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "../rbac";
import { Report, SHEET_LIST, type Ctx, type ImportResult } from "./common";
import { parseWorkbook } from "./parse";
import { flushMaster, loadMaster, stageAkun, stageCgLeader, stageOrang, stagePelayanan, stagePilihan, stageRuangan, stageTemplate, stageTemplateSlot } from "./master";
import { stageSchedule, writeSchedule } from "./schedule";
import { Ledger } from "./ledger";
import { stageGroups } from "./groups";
import { flushGroups, loadExistingMeetings, loadGroups, loadRoomBookings, writeMeetings } from "./groupsIO";
import { stageMeetings } from "./rapat";
import { k, parseDate, parseTime } from "./common";
import { zonedToUtc } from "../time";
import { prisma } from "../prisma";
import { syncEbmGroup } from "../ebmGroup";
import { syncTkiGroup } from "../tkiGroup";

/**
 * Impor data dari Excel. mode "preview" hanya memeriksa (tidak menulis apa pun);
 * mode "apply" menulis data master dalam satu transaksi, lalu acara satu per satu.
 */
export async function runImport(u: AuthUser, file: Buffer, mode: "preview" | "apply"): Promise<ImportResult> {
  const rep = new Report();
  const ctx: Ctx = { u, apply: mode === "apply", rep };
  const base = (extra: Partial<ImportResult>): ImportResult => ({ mode, ok: true, sheets: rep.list(), credentials: [], unknownSheets: [], ...extra });

  let parsed;
  try {
    parsed = parseWorkbook(file);
  } catch (e) {
    console.error("[impor] gagal membaca Excel:", e);
    return base({ ok: false, fatal: "File tidak bisa dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv) dan tidak rusak." });
  }
  for (const key of parsed.found) rep.get(key).found = true;
  for (const [key, msgs] of Object.entries(parsed.headerErrors)) for (const m of msgs!) rep.err(key, 0, m);
  if (!parsed.found.size) return base({ ok: false, fatal: "Tidak ada sheet yang dikenali. Pakai template resmi dan jangan ganti nama sheet.", unknownSheets: parsed.unknownSheets });
  // sheet dengan judul kolom rusak tidak diproses
  const rows = Object.fromEntries(SHEET_LIST.map((s) => [s.key, parsed.headerErrors[s.key] ? [] : parsed.rows[s.key]])) as typeof parsed.rows;

  const st = await loadMaster(u.tenantId);
  stagePilihan(ctx, st, rows.Pilihan);
  stagePelayanan(ctx, st, rows.Pelayanan);
  stageRuangan(ctx, st, rows.Ruangan);
  stageOrang(ctx, st, rows.Orang);
  stageCgLeader(ctx, st, rows.CGLeader);
  await stageAkun(ctx, st, rows.Akun);
  stageTemplate(ctx, st, rows.TemplateAcara);
  stageTemplateSlot(ctx, st, rows.TemplateSlot);
  const ledger = new Ledger();
  const plan = await stageSchedule(ctx, st, { Acara: rows.Acara, Penugasan: rows.Penugasan, Latihan: rows.Latihan }, ledger);

  // Kelompok rapat dan rapatnya (setelah Orang dan Ruangan, karena anggota dan ruangan dicocokkan dengan keduanya)
  const gs = await loadGroups(u.tenantId);
  stageGroups(ctx, st, gs, { KelompokRapat: rows.KelompokRapat, JabatanKelompok: rows.JabatanKelompok, AnggotaKelompok: rows.AnggotaKelompok });
  const rapatDates = rows.Rapat.map((r) => parseDate(r.v.date)).filter((x): x is string => !!x);
  const existingMeetings = await loadExistingMeetings(u.tenantId, rapatDates, gs);
  await loadRoomBookings(ctx, st, ledger, rows.Rapat.flatMap((r) => {
    const room = r.v.room ? st.M.rooms.get(k(r.v.room)) : undefined;
    const d = parseDate(r.v.date), a = parseTime(r.v.start), b = parseTime(r.v.end);
    if (!room || !d || !a || !b) return [];
    return [{ roomId: room.id, s: zonedToUtc(d, a), e: zonedToUtc(d, b) }];
  }));
  const meetings = stageMeetings(ctx, st, gs, rows.Rapat, ledger, existingMeetings);

  if (mode === "apply") {
    try {
      await flushMaster(st);
    } catch (e) {
      console.error(e);
      return base({ ok: false, fatal: "Data master gagal disimpan, jadi tidak ada yang berubah. Coba periksa ulang file lalu impor lagi.", unknownSheets: parsed.unknownSheets });
    }
    await writeSchedule(ctx, st, plan);
    await flushGroups(ctx, gs);
    // yang melayani di EBM masuk kelompok EBM (setelah kelompok dari file ditulis, supaya tidak bentrok nama)
    try { await syncEbmGroup(prisma, u.tenantId, { only: [...new Set(st.W.personMinistries.map((x) => x.personId))], userId: u.userId }); } catch (e) { console.error(e); }
    try { await syncTkiGroup(prisma, u.tenantId, { userId: u.userId }); } catch (e) { console.error(e); } // akun Penjadwal dari file masuk kelompok TKI
    await writeMeetings(ctx, meetings);
    await audit({
      tenantId: u.tenantId, userId: u.userId, action: "import.apply", entity: "Import", entityId: randomUUID(),
      payload: Object.fromEntries(rep.list().filter((s) => s.found).map((s) => [s.key, { dibuat: s.created, dilewati: s.skipped, error: s.errors.length }])),
    });
  }
  return base({ credentials: st.credentials, unknownSheets: parsed.unknownSheets });
}
