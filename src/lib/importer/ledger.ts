import { localParts } from "../time";

type Booked = { s: number; e: number; label: string };

/** Catatan pemakaian ruangan/orang: dari database dan dari file ini, untuk deteksi bentrok. */
export class Ledger {
  private m = new Map<string, Booked[]>();
  add(key: string, s: Date, e: Date, label: string) {
    const list = this.m.get(key) ?? [];
    list.push({ s: s.getTime(), e: e.getTime(), label });
    this.m.set(key, list);
  }
  clash(key: string, s: Date, e: Date): string | null {
    const hit = (this.m.get(key) ?? []).find((x) => x.s < e.getTime() && x.e > s.getTime());
    return hit ? hit.label : null;
  }
}

export const fmtRange = (a: Date, b: Date) => `${localParts(a).date} ${localParts(a).time}–${localParts(b).time}`;
