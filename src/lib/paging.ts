import { z } from "zod";

/** Aturan paging yang sama untuk semua daftar di aplikasi. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE: number = PAGE_SIZES[0]; // selalu pilihan terkecil (10)

/** Bagian zod untuk query paging. `limit` diterima sebagai nama lama dari `pageSize`. */
export const pagingQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
};

export type PagingInput = { page: number; pageSize?: number; limit?: number };

export function resolvePaging(q: PagingInput, def = DEFAULT_PAGE_SIZE) {
  const pageSize = q.pageSize ?? q.limit ?? def;
  return { page: q.page, pageSize, skip: (q.page - 1) * pageSize, take: pageSize };
}

/** Bentuk respons daftar: item halaman ini, jumlah seluruhnya, dan posisi halaman. */
export function pageOf<T>(items: T[], total: number, p: { page: number; pageSize: number }) {
  return { items, total, page: p.page, pageSize: p.pageSize, limit: p.pageSize, pages: Math.max(1, Math.ceil(total / p.pageSize)) };
}
