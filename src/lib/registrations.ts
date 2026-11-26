import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, notFound } from "./errors";
import { nameKey } from "./names";
import { rankMatches } from "./personMatch";
import { pageOf, pagingQuery, resolvePaging } from "./paging";
import { createAccountForPerson } from "./accounts";
import { audit } from "./audit";
import type { AuthUser } from "./rbac";
import { PASSWORD_MIN } from "./passwordRules";
import { mailConfigured } from "./mailer";
import { sendVerification } from "./emailVerify";

/** Batas pengiriman: per alamat per jam, dan jumlah permintaan menunggu seluruhnya. */
export const MAX_PER_IP_PER_HOUR = 5;
export const MAX_PENDING = 300;

export const registerBody = z.object({
  name: z.string().trim().min(2, "Nama lengkap wajib diisi.").max(120),
  email: z.string().trim().toLowerCase().max(120).email("Format email belum benar."),
  password: z.string().min(PASSWORD_MIN, `Kata sandi minimal ${PASSWORD_MIN} karakter.`).max(100),
  website: z.string().max(200).optional(), // kolom jebakan: manusia tidak melihatnya, pengisi otomatis mengisinya
});

/** Pendaftaran dari halaman publik. Tidak membuat akun: hanya mencatat permintaan untuk disetujui admin. */
export async function submitRegistration(b: z.infer<typeof registerBody>, ip: string) {
  if (b.website) return { ok: true as const, verify: "SENT" as "OFF" | "SENT" | "FAILED" }; // kolom jebakan terisi: pura-pura berhasil, tidak disimpan
  const tenant = await prisma.tenant.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!tenant) throw new ApiError(503, "UNAVAILABLE", "Pendaftaran belum tersedia.");

  const since = new Date(Date.now() - 3_600_000);
  const [recent, pending, user, dup] = await Promise.all([
    prisma.registrationRequest.count({ where: { ip: ip === "unknown" ? null : ip, createdAt: { gte: since } } }), // alamat tak terbaca dihitung sebagai satu kelompok, bukan dibebaskan
    prisma.registrationRequest.count({ where: { tenantId: tenant.id, status: "PENDING" } }),
    prisma.user.findFirst({ where: { tenantId: tenant.id, email: b.email }, select: { id: true } }),
    prisma.registrationRequest.findFirst({ where: { tenantId: tenant.id, email: b.email, status: "PENDING" }, select: { id: true } }),
  ]);
  if (recent >= MAX_PER_IP_PER_HOUR) throw new ApiError(429, "TOO_MANY", "Terlalu banyak permintaan dari alamat ini. Coba lagi sekitar satu jam lagi.");
  if (pending >= MAX_PENDING) throw new ApiError(429, "TOO_MANY", "Antrean permintaan sedang penuh. Hubungi admin gereja.");
  if (user) throw conflict("Email ini sudah terdaftar. Silakan masuk, atau hubungi admin bila lupa kata sandi.");
  if (dup) throw conflict("Permintaan dengan email ini sudah dikirim dan sedang menunggu persetujuan admin.");

  const r = await prisma.registrationRequest.create({
    data: { tenantId: tenant.id, name: b.name, email: b.email, passwordHash: await bcrypt.hash(b.password, 10), ip: ip === "unknown" ? null : ip },
  });
  await audit({ tenantId: tenant.id, userId: null, action: "registration.submit", entity: "RegistrationRequest", entityId: r.id, payload: { email: b.email } });
  // Email verifikasi: permintaan baru bisa disetujui admin setelah pendaftar membuka tautannya. Kegagalan kirim tidak menggagalkan pendaftaran (bisa kirim ulang).
  const verify = await sendVerification({ tenantId: tenant.id, kind: "REGISTRATION", refId: r.id, email: b.email, name: b.name }).catch(() => "FAILED" as const);
  return { ok: true as const, verify: verify as "OFF" | "SENT" | "FAILED" };
}

export const resendBody = z.object({ email: z.string().trim().toLowerCase().max(120).email() });

/** Kirim ulang email verifikasi untuk permintaan yang masih menunggu. Jawabannya selalu sama supaya alamat yang terdaftar tidak bisa ditebak. */
export async function resendRegistrationVerification(b: z.infer<typeof resendBody>) {
  const tenant = await prisma.tenant.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!tenant) throw new ApiError(503, "UNAVAILABLE", "Pendaftaran belum tersedia.");
  const req = await prisma.registrationRequest.findFirst({ where: { tenantId: tenant.id, email: b.email, status: "PENDING", emailVerifiedAt: null }, select: { id: true, name: true } });
  // jeda per tujuan tidak ditampilkan: jawabannya selalu sama, jadi tidak bisa dipakai menebak alamat yang sedang menunggu
  if (req) await sendVerification({ tenantId: tenant.id, kind: "REGISTRATION", refId: req.id, email: b.email, name: req.name }).catch((e) => { if (!(e instanceof ApiError && e.status === 429)) throw e; });
  return { ok: true as const };
}

export const registrationQuery = z.object({
  ...pagingQuery,
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).default("PENDING"),
  search: z.string().trim().max(80).optional(),
});

export async function listRegistrations(u: AuthUser, q: z.infer<typeof registrationQuery>) {
  const pg = resolvePaging(q);
  const where: Prisma.RegistrationRequestWhereInput = {
    tenantId: u.tenantId,
    ...(q.status !== "ALL" ? { status: q.status } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } }] } : {}),
  };
  const [total, rows, pending] = await Promise.all([
    prisma.registrationRequest.count({ where }),
    prisma.registrationRequest.findMany({ where, orderBy: [{ createdAt: q.status === "PENDING" ? "asc" : "desc" }], skip: pg.skip, take: pg.take }),
    prisma.registrationRequest.count({ where: { tenantId: u.tenantId, status: "PENDING" } }),
  ]);
  const personIds = rows.map((r) => r.personId).filter((x): x is string => !!x);
  const persons = personIds.length ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(persons.map((p) => [p.id, p.name]));
  return {
    ...pageOf(rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, status: r.status, createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null, personName: r.personId ? nameOf.get(r.personId) ?? null : null, rejectReason: r.rejectReason,
      emailVerified: !!r.emailVerifiedAt,
    })), total, pg),
    pending,
    mailOn: mailConfigured(), // bila email aktif, hanya permintaan dengan email terverifikasi yang bisa disetujui
  };
}

export async function pendingCount(tenantId: string) {
  return prisma.registrationRequest.count({ where: { tenantId, status: "PENDING" } });
}

/** Orang yang namanya mirip dengan nama pendaftar: yang belum punya akun (bisa ditautkan) dan yang sudah punya akun (hanya diberi tahu). */
export async function suggestPersons(u: AuthUser, id: string) {
  const r = await prisma.registrationRequest.findFirst({ where: { id, tenantId: u.tenantId } });
  if (!r) throw notFound("Permintaan");
  const tokens = nameKey(r.name).split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return { items: [], withAccount: [] };
  const cands = await prisma.person.findMany({
    where: { tenantId: u.tenantId, deletedAt: null, OR: tokens.map((t) => ({ nameKey: { contains: t.slice(0, Math.max(3, Math.min(t.length, 4))) } })) },
    select: { id: true, name: true, nameKey: true, birthDate: true, position: { select: { name: true } }, cgGroup: { select: { name: true } }, user: { select: { email: true, isActive: true, deletedAt: true } } },
    take: 200,
  });
  const free = cands.filter((p) => !p.user);
  const taken = cands.filter((p) => p.user && !p.user.deletedAt); // akun sudah ada: tidak bisa ditautkan lagi (satu orang satu akun)
  return {
    items: rankMatches(r.name, free).map((p) => ({ id: p.id, name: p.name, position: p.position.name, cg: p.cgGroup?.name ?? null })),
    withAccount: rankMatches(r.name, taken, 3).map((p) => ({ id: p.id, name: p.name, email: p.user!.email, isActive: p.user!.isActive })),
  };
}

export const approveBody = z.object({
  personId: z.string().uuid(),
  roleCodes: z.array(z.enum(["PENJADWAL", "PETUGAS_ABSEN", "PELAYAN"])).max(3).default([]), // Admin Tim dan Superadmin diatur lewat Kelola akun
});

/** Setujui: buat akun dari data permintaan dan tautkan ke orang yang sudah ada (atau yang baru dibuat admin). */
export async function approveRegistration(u: AuthUser, id: string, b: z.infer<typeof approveBody>) {
  if (mailConfigured()) {
    const pre = await prisma.registrationRequest.findFirst({ where: { id, tenantId: u.tenantId }, select: { emailVerifiedAt: true, status: true } });
    if (pre && pre.status === "PENDING" && !pre.emailVerifiedAt) throw conflict("Email pendaftar belum diverifikasi. Minta pendaftar membuka tautan di emailnya; email bisa dikirim ulang dari halaman Daftar.");
  }
  // "Klaim" dulu secara atomik supaya dua admin tidak menyetujui permintaan yang sama bersamaan.
  const claimed = await prisma.registrationRequest.updateMany({ where: { id, tenantId: u.tenantId, status: "PENDING" }, data: { status: "APPROVED", decidedAt: new Date(), decidedById: u.userId, personId: b.personId } });
  if (claimed.count !== 1) {
    const exists = await prisma.registrationRequest.count({ where: { id, tenantId: u.tenantId } });
    if (!exists) throw notFound("Permintaan");
    throw conflict("Permintaan ini sudah diputuskan.");
  }
  const r = await prisma.registrationRequest.findUniqueOrThrow({ where: { id } });
  try {
    if (!r.passwordHash) throw badRequest("Permintaan ini tidak punya kata sandi tersimpan. Minta pendaftar mengirim ulang.");
    const acc = await createAccountForPerson(u, b.personId, { email: r.email, password: "x".repeat(PASSWORD_MIN), roleCodes: b.roleCodes }, { passwordHash: r.passwordHash });
    await prisma.registrationRequest.update({ where: { id }, data: { passwordHash: null } }); // hash tidak lagi dibutuhkan
    if (r.emailVerifiedAt) await prisma.user.update({ where: { id: acc.id }, data: { emailVerifiedAt: r.emailVerifiedAt } }); // verifikasi saat mendaftar ikut terbawa ke akun
    await audit({ tenantId: u.tenantId, userId: u.userId, action: "registration.approve", entity: "RegistrationRequest", entityId: id, payload: { personId: b.personId, email: r.email, roles: b.roleCodes.join(",") || "-" } });
    return { id: acc.id, email: acc.email };
  } catch (e) {
    // gagal membuat akun (mis. orang itu sudah punya akun): kembalikan ke antrean supaya admin bisa memilih orang lain
    await prisma.registrationRequest.update({ where: { id }, data: { status: "PENDING", decidedAt: null, decidedById: null, personId: null } });
    throw e;
  }
}

export const rejectBody = z.object({ reason: z.string().trim().max(200).optional() });

export async function rejectRegistration(u: AuthUser, id: string, b: z.infer<typeof rejectBody>) {
  const res = await prisma.registrationRequest.updateMany({
    where: { id, tenantId: u.tenantId, status: "PENDING" },
    data: { status: "REJECTED", decidedAt: new Date(), decidedById: u.userId, passwordHash: null, rejectReason: b.reason || null },
  });
  if (res.count !== 1) {
    const exists = await prisma.registrationRequest.count({ where: { id, tenantId: u.tenantId } });
    if (!exists) throw notFound("Permintaan");
    throw conflict("Permintaan ini sudah diputuskan.");
  }
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "registration.reject", entity: "RegistrationRequest", entityId: id, reason: b.reason || null });
  return { id };
}
