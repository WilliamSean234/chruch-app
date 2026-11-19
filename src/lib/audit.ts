import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export async function audit(
  input: {
    tenantId: string;
    userId?: string | null;
    action: string; // mis. event.publish, booking.override
    entity: string;
    entityId: string;
    reason?: string | null;
    payload?: Prisma.InputJsonValue;
  },
  db: Db = prisma,
) {
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      reason: input.reason ?? null,
      payload: input.payload,
    },
  });
}
