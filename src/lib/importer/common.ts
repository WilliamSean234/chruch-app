import type { AuthUser } from "../rbac";

/** Satu baris data dari Excel. `n` = nomor baris di Excel, `v` = isi sel per kolom (sudah berupa teks). */
export type Row = { n: number; v: Record<string, string> };

export type SheetResult = {
  key: string;
  label: string;
  found: boolean;
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  notes: { row: number; message: string }[];
};

export type Credential = { name: string; email: string; password: string; role: string };

export type ImportResult = {
  mode: "preview" | "apply";
  ok: boolean;
  fatal?: string;
  sheets: SheetResult[];
  credentials: Credential[];
  unknownSheets: string[];
  retiredSheets: string[]; // sheet lama (acara, rapat, ...) yang diabaikan
  source?: "kuesioner"; // file dikenali sebagai kuesioner pendataan dan diubah ke baris impor
  notes?: string[]; // catatan dari pengubah kuesioner (yang tidak diimpor, perlu dicek manual)
};

/** Urutan proses = urutan sheet di template. */
export const SHEET_LIST = [
  { key: "Pilihan", label: "Pilihan (posisi, CG, komunitas, tim)" },
  { key: "Pelayanan", label: "Pelayanan" },
  { key: "Ruangan", label: "Ruangan" },
  { key: "Orang", label: "Orang" },
  { key: "CGLeader", label: "Leader CG" },
  { key: "Akun", label: "Akun login" },
  { key: "TemplateAcara", label: "Template acara" },
  { key: "TemplateSlot", label: "Posisi di template" },
  { key: "KelompokRapat", label: "Kelompok rapat" },
  { key: "JabatanKelompok", label: "Jabatan kelompok" },
  { key: "AnggotaKelompok", label: "Anggota kelompok" },
] as const;
export type SheetKey = (typeof SHEET_LIST)[number]["key"];

/** Kolom tiap sheet: kunci internal → judul kolom di Excel (tanpa tanda *). */
export const COLS: Record<SheetKey, Record<string, string>> = {
  Pilihan: { position: "Posisi di gereja", cg: "Kelompok CG", community: "Komunitas", team: "Tim pelayanan" },
  Pelayanan: { team: "Tim", name: "Pelayanan", rehearsal: "Wajib latihan", bandOnly: "Khusus band" },
  Ruangan: { name: "Nama ruangan", floor: "Lantai", active: "Aktif" },
  Orang: { title: "Gelar", name: "Nama", nickname: "Nama panggilan", birth: "Tanggal lahir", gender: "JK", position: "Posisi di gereja", cg: "Kelompok CG", community: "Komunitas", origin: "Asal", originChurch: "Gereja asal", ministries: "Pelayanan" },
  CGLeader: { cg: "Kelompok CG", person: "Nama leader" },
  Akun: { person: "Nama orang", email: "Email", role: "Role", team: "Tim yang dikelola" },
  TemplateAcara: { name: "Nama template", pattern: "Pola", day: "Hari", nth: "Minggu ke", start: "Jam mulai", dur: "Durasi menit", room: "Ruangan", mode: "Mode kehadiran", community: "Komunitas daftar nama" },
  TemplateSlot: { tpl: "Nama template", ministry: "Pelayanan", count: "Jumlah kursi", rehearsal: "Wajib latihan" },
  KelompokRapat: { name: "Nama kelompok", quorum: "Kuorum" },
  JabatanKelompok: { group: "Kelompok", name: "Jabatan", seats: "Jumlah orang", schedule: "Boleh menjadwalkan rapat", write: "Boleh menulis notulen", finalize: "Boleh memfinalkan notulen", manage: "Boleh mengatur anggota" },
  AnggotaKelompok: { group: "Kelompok", person: "Nama orang", positions: "Jabatan" },
};

/** Kolom yang boleh tidak ada di file lama (dianggap kosong). Kolom baru ditambahkan di sini supaya template lama tetap bisa diimpor. */
export const OPTIONAL_COLS: Partial<Record<SheetKey, string[]>> = {
  JabatanKelompok: ["seats"], Orang: ["nickname"], Ruangan: ["floor"], Pelayanan: ["bandOnly"],
};

/**
 * Sheet yang dulu ada di template tetapi sudah dihapus: acara, penugasan, latihan, dan rapat sekarang dibuat lewat aplikasi.
 * File lama yang masih memilikinya tetap bisa diunggah; sheet itu diabaikan dengan catatan di hasil periksa.
 */
export const RETIRED_SHEETS = ["Acara", "Penugasan", "Latihan", "Rapat"] as const;

/** Pembanding judul/nama: huruf kecil, tanda baca dan bintang dibuang. */
export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
/** Kunci pencocokan nama (ruangan, tim, pelayanan, ...). */
export const k = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export const splitList = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export function yes(s: string, fallback: boolean): boolean {
  const t = k(s);
  if (!t) return fallback;
  if (["ya", "y", "yes", "true", "1", "aktif"].includes(t)) return true;
  if (["tidak", "t", "no", "n", "false", "0", "nonaktif"].includes(t)) return false;
  return fallback;
}
export const isYesNo = (s: string) => !s || ["ya", "y", "yes", "true", "1", "aktif", "tidak", "t", "no", "n", "false", "0", "nonaktif"].includes(k(s));

export function parseDate(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseTime(s: string): string | null {
  const t = s.trim();
  const r = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(t);
  if (r) {
    const h = +r[1], m = +r[2];
    return h < 24 && m < 60 ? `${String(h).padStart(2, "0")}:${r[2]}` : null;
  }
  const f = Number(t); // pecahan hari dari Excel
  if (t && Number.isFinite(f) && f >= 0 && f < 1) {
    const total = Math.round(f * 1440);
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  return null;
}

export const minutesOf = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

export function parseInt0(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t.replace(/\.0+$/, ""))) return null;
  return Number(t.replace(/\.0+$/, ""));
}

/** Pelaporan hasil per sheet. */
export class Report {
  private m = new Map<string, SheetResult>();
  constructor() {
    for (const s of SHEET_LIST) this.m.set(s.key, { key: s.key, label: s.label, found: false, total: 0, created: 0, skipped: 0, errors: [], notes: [] });
  }
  get(key: string) { return this.m.get(key)!; }
  list() { return SHEET_LIST.map((s) => this.m.get(s.key)!); }
  seen(key: string) { this.get(key).total++; }
  ok(key: string) { this.get(key).created++; }
  skip(key: string, row: number, msg: string) { const s = this.get(key); s.skipped++; s.notes.push({ row, message: msg }); }
  err(key: string, row: number, msg: string) { this.get(key).errors.push({ row, message: msg }); }
  note(key: string, row: number, msg: string) { this.get(key).notes.push({ row, message: msg }); }
  /** Baris yang tadinya dianggap berhasil ternyata gagal saat ditulis. */
  fail(key: string, row: number, msg: string) { const s = this.get(key); if (s.created > 0) s.created--; s.errors.push({ row, message: msg }); }
}

export type Ctx = { u: AuthUser; apply: boolean; rep: Report };
