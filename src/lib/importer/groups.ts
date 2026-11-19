import { randomUUID } from "node:crypto";
import { nameKey } from "../names";
import { isYesNo, k, parseInt0, splitList, yes, type Ctx, type Row } from "./common";
import type { MasterState } from "./master";

/**
 * Kelompok rapat dari Excel: sheet KelompokRapat, JabatanKelompok, AnggotaKelompok.
 * Bagian ini murni (tanpa database): data yang sudah ada dimuat lebih dulu (lihat groupsIO.ts) lalu dicocokkan di sini.
 * Aturan sama dengan di aplikasi: setiap kelompok baru otomatis punya jabatan "Anggota" tanpa hak khusus,
 * dan yang sudah ada TIDAK diubah (dilewati dengan catatan), supaya file boleh diunggah berulang kali.
 */

export type Caps = { schedule: boolean; write: boolean; finalize: boolean; manage: boolean };
export type GPos = { id: string; name: string; isNew: boolean; auto?: boolean; deleted?: boolean; sortOrder: number; caps: Caps; row?: number };
export type GMem = { id: string; personId: string; name: string; isNew: boolean; left: boolean; rejoin?: boolean; positionIds: string[]; row?: number };
export type Grp = {
  id: string; name: string; isNew: boolean; deleted: boolean; quorum: number | null; sortOrder: number; row?: number;
  failed?: boolean; // kelompok baru yang gagal disimpan saat apply
  positions: Map<string, GPos>; // kunci: k(nama jabatan)
  members: Map<string, GMem>; // kunci: personId
};
export type GroupState = { groups: Map<string, Grp> }; // kunci: k(nama kelompok)

export const NO_CAPS: Caps = { schedule: false, write: false, finalize: false, manage: false };
export const BASE_POSITION = "Anggota";

/** Anggota aktif kelompok (termasuk yang baru dari file ini). */
export const activeCount = (g: Grp) => [...g.members.values()].filter((m) => !m.left).length;

export function stageGroups(ctx: Ctx, st: MasterState, gs: GroupState, rows: { KelompokRapat: Row[]; JabatanKelompok: Row[]; AnggotaKelompok: Row[] }) {
  const { rep } = ctx;
  const { M } = st;
  let nextOrder = Math.max(0, ...[...gs.groups.values()].map((g) => g.sortOrder));

  // ── Kelompok ──
  for (const r of rows.KelompokRapat) {
    rep.seen("KelompokRapat");
    const name = r.v.name.trim().replace(/\s+/g, " ");
    const errs: string[] = [];
    if (!name) errs.push("Nama kelompok wajib diisi.");
    if (name.length > 80) errs.push("Nama kelompok terlalu panjang (maks 80 huruf).");
    let quorum: number | null = null;
    const qs = r.v.quorum.trim().replace(/%$/, "").trim();
    if (qs) {
      const q = parseInt0(qs);
      if (q === null || q < 1 || q > 100) errs.push(`Kuorum harus angka 1 sampai 100 (isinya "${r.v.quorum}"). Kosongkan bila tanpa kuorum.`);
      else quorum = q;
    }
    if (errs.length) { rep.err("KelompokRapat", r.n, errs.join(" ")); continue; }
    const ex = gs.groups.get(k(name));
    if (ex) {
      if (ex.deleted) rep.err("KelompokRapat", r.n, `Nama "${name}" dipakai kelompok yang sudah dihapus. Pakai nama lain.`);
      else if (ex.isNew) rep.err("KelompokRapat", r.n, `Kelompok "${name}" muncul dua kali di file.`);
      else rep.skip("KelompokRapat", r.n, `Kelompok "${ex.name}" sudah ada, jadi dilewati (kuorum dan jabatannya tidak diubah).`);
      continue;
    }
    const base: GPos = { id: randomUUID(), name: BASE_POSITION, isNew: true, auto: true, sortOrder: 99, caps: { ...NO_CAPS } };
    gs.groups.set(k(name), {
      id: randomUUID(), name, isNew: true, deleted: false, quorum, sortOrder: ++nextOrder, row: r.n,
      positions: new Map([[k(BASE_POSITION), base]]), members: new Map(),
    });
    rep.ok("KelompokRapat");
  }

  const groupOf = (sheet: "JabatanKelompok" | "AnggotaKelompok", r: Row): Grp | undefined => {
    const name = r.v.group.trim();
    if (!name) { rep.err(sheet, r.n, "Kelompok wajib diisi."); return; }
    const g = gs.groups.get(k(name));
    if (!g || g.deleted) { rep.err(sheet, r.n, `Kelompok "${name}" belum ada (cek ejaan atau isi sheet KelompokRapat).`); return; }
    return g;
  };

  // ── Jabatan ──
  for (const r of rows.JabatanKelompok) {
    rep.seen("JabatanKelompok");
    const g = groupOf("JabatanKelompok", r);
    if (!g) continue;
    const name = r.v.name.trim().replace(/\s+/g, " ");
    const errs: string[] = [];
    if (!name) errs.push("Nama jabatan wajib diisi.");
    if (name.length > 60) errs.push("Nama jabatan terlalu panjang (maks 60 huruf).");
    const flags = { schedule: r.v.schedule, write: r.v.write, finalize: r.v.finalize, manage: r.v.manage };
    const label = { schedule: "Boleh menjadwalkan rapat", write: "Boleh menulis notulen", finalize: "Boleh memfinalkan notulen", manage: "Boleh mengatur anggota" };
    for (const [key, v] of Object.entries(flags)) if (!isYesNo(v)) errs.push(`${label[key as keyof typeof label]}: isi Ya atau Tidak (isinya "${v}"; kosong = Tidak).`);
    if (errs.length) { rep.err("JabatanKelompok", r.n, errs.join(" ")); continue; }
    const ex = g.positions.get(k(name));
    if (ex) {
      if (ex.deleted) rep.err("JabatanKelompok", r.n, `Jabatan "${name}" di ${g.name} pernah dihapus. Pakai nama lain.`);
      else if (ex.auto) rep.skip("JabatanKelompok", r.n, `Jabatan ${BASE_POSITION} otomatis ada di setiap kelompok (tanpa hak khusus), jadi dilewati.`);
      else if (ex.isNew) rep.err("JabatanKelompok", r.n, `Jabatan "${name}" muncul dua kali di kelompok ${g.name}.`);
      else rep.skip("JabatanKelompok", r.n, `Jabatan "${ex.name}" di ${g.name} sudah ada, haknya tidak diubah.`);
      continue;
    }
    const used = [...g.positions.values()].filter((p) => p.sortOrder < 99).map((p) => p.sortOrder);
    g.positions.set(k(name), {
      id: randomUUID(), name, isNew: true, sortOrder: Math.max(0, ...used) + 1, row: r.n,
      caps: { schedule: yes(flags.schedule, false), write: yes(flags.write, false), finalize: yes(flags.finalize, false), manage: yes(flags.manage, false) },
    });
    rep.ok("JabatanKelompok");
  }

  // ── Anggota ──
  for (const r of rows.AnggotaKelompok) {
    rep.seen("AnggotaKelompok");
    const g = groupOf("AnggotaKelompok", r);
    if (!g) continue;
    const errs: string[] = [];
    const person = r.v.person.trim() ? M.persons.get(nameKey(r.v.person)) : undefined;
    if (!r.v.person.trim()) errs.push("Nama orang wajib diisi.");
    else if (!person) errs.push(`"${r.v.person}" belum ada di data Orang (isi sheet Orang atau cek ejaan).`);
    const wanted = splitList(r.v.positions);
    const ids: string[] = [];
    for (const w of wanted.length ? wanted : [BASE_POSITION]) {
      const p = g.positions.get(k(w));
      if (!p || p.deleted) errs.push(`Jabatan "${w}" belum ada di kelompok ${g.name} (daftarkan di sheet JabatanKelompok).`);
      else if (!ids.includes(p.id)) ids.push(p.id);
    }
    if (errs.length) { rep.err("AnggotaKelompok", r.n, errs.join(" ")); continue; }
    const cur = g.members.get(person!.id);
    if (cur && !cur.left) {
      if (cur.isNew || cur.rejoin) rep.err("AnggotaKelompok", r.n, `${person!.name} muncul dua kali di kelompok ${g.name}.`);
      else rep.skip("AnggotaKelompok", r.n, `${person!.name} sudah anggota ${g.name}, jabatannya tidak diubah.`);
      continue;
    }
    if (cur) { // pernah keluar: bergabung kembali, sama seperti di aplikasi
      cur.left = false; cur.rejoin = true; cur.positionIds = ids; cur.row = r.n;
      rep.note("AnggotaKelompok", r.n, `${person!.name} pernah keluar dari ${g.name}, sekarang bergabung kembali.`);
    } else {
      g.members.set(person!.id, { id: randomUUID(), personId: person!.id, name: person!.name, isNew: true, left: false, positionIds: ids, row: r.n });
    }
    rep.ok("AnggotaKelompok");
  }
}
