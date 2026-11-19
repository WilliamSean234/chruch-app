"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { callApi, errMsg } from "@/components/jadwal/api";
import { DEFAULT_PAGE_SIZE } from "@/lib/paging";

/** Menunda nilai (mis. kotak cari) supaya server tidak dipanggil di tiap ketikan. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Daftar berhalaman dari server. Mengganti filter selalu kembali ke halaman 1.
 * `params` yang kosong/undefined tidak dikirim. `data` memuat seluruh respons (mis. pilihan filter di `data.options`).
 */
export function usePagedList<T, D = Record<string, unknown>>(path: string, params: Record<string, string | undefined>, opts?: { pageSize?: number; enabled?: boolean }) {
  const key = useMemo(() => JSON.stringify(params), [params]);
  const [pg, setPg] = useState({ page: 1, size: opts?.pageSize ?? DEFAULT_PAGE_SIZE, key });
  const page = pg.key === key ? pg.page : 1;
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [data, setData] = useState<(D & { items: T[]; total: number }) | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const enabled = opts?.enabled ?? true;

  const setPage = useCallback((p: number) => setPg((s) => ({ ...s, page: p, key })), [key]);
  const setPageSize = useCallback((n: number) => setPg({ page: 1, size: n, key }), [key]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pg.size) });
    for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string | undefined>)) if (v) q.set(k, v);
    void callApi("GET", `${path}?${q}`).then((r) => {
      if (!live) return;
      setLoading(false);
      if (!r.ok) { setError(errMsg(r.data)); setItems((x) => x ?? []); return; }
      setError("");
      // halaman terakhir ikut habis (mis. setelah hapus): mundur satu halaman
      if (r.data.items.length === 0 && r.data.total > 0 && page > 1) { setPg({ page: Math.ceil(r.data.total / pg.size), size: pg.size, key }); return; }
      setItems(r.data.items); setTotal(r.data.total); setData(r.data);
    });
    return () => { live = false; };
  }, [path, key, page, pg.size, version, enabled]);

  return { items, total, page, pageSize: pg.size, setPage, setPageSize, error, loading, reload, data, setItems };
}

/** Paging di sisi klien untuk daftar yang sudah dimuat penuh (papan ruangan, anggota kelompok). */
export function useClientPaging<T>(list: T[], defaultSize: number = DEFAULT_PAGE_SIZE) {
  const [state, setState] = useState({ page: 1, size: defaultSize });
  // daftar berganti (filter berubah / data dimuat ulang): kembali ke halaman 1
  useEffect(() => { setState((s) => (s.page === 1 ? s : { ...s, page: 1 })); }, [list]);
  const pages = Math.max(1, Math.ceil(list.length / state.size));
  const page = Math.min(state.page, pages);
  const slice = useMemo(() => list.slice((page - 1) * state.size, page * state.size), [list, page, state.size]);
  return { slice, page, pageSize: state.size, total: list.length, setPage: (p: number) => setState((s) => ({ ...s, page: p })), setPageSize: (n: number) => setState({ page: 1, size: n }) };
}
