/* eslint-disable @typescript-eslint/no-explicit-any */
export async function callApi(method: string, url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined, cache: "no-store" });
  let data: any = null;
  try { data = await r.json(); } catch { /* 204 tanpa isi */ }
  // setelah menyimpan sesuatu, angka penanda di menu (permintaan daftar dan pengganti) diambil ulang seketika
  if (r.ok && method !== "GET" && typeof window !== "undefined") window.dispatchEvent(new Event("badges:refresh"));
  return { ok: r.ok, status: r.status, data };
}
export const errMsg = (d: any) => d?.error?.message ?? "Terjadi kesalahan. Coba lagi.";
export const hmInput = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const diffMin = (start: string, end: string) => { const [a, b] = start.split(":").map(Number); const [c, d] = end.split(":").map(Number); return c * 60 + d - (a * 60 + b); };
export const addToTime = (start: string, min: number) => { const [h, m] = start.split(":").map(Number); const t = h * 60 + m + min; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

export const inputCls = "h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 text-sm font-semibold";
export const btnPrimary = "h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50";
export const btnGhost = "h-11 rounded-xl border border-[#D0D3E8] bg-white px-4 text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] disabled:opacity-50";
export const card = "rounded-[20px] border border-[var(--line)] bg-white p-[22px]";
