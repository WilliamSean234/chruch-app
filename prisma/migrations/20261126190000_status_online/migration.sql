-- Status online: satu baris per tab/perangkat yang sedang membuka aplikasi (lihat lib/presence).
CREATE TABLE IF NOT EXISTS "Presence" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Presence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Presence_userId_clientId_key" ON "Presence"("userId", "clientId");
CREATE INDEX IF NOT EXISTS "Presence_tenantId_seenAt_idx" ON "Presence"("tenantId", "seenAt");
DO $$ BEGIN
  ALTER TABLE "Presence" ADD CONSTRAINT "Presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
