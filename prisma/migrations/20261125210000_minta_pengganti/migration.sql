-- Pelayan bisa meminta kursinya digantikan; Penjadwal atau Admin Tim tim itu yang memutuskan.
CREATE TABLE IF NOT EXISTS "SwapRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "teamTypeId" TEXT NOT NULL,
    "requesterPersonId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestedName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pendingKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" TEXT,
    "decisionNote" TEXT,
    "replacementPersonId" TEXT,

    CONSTRAINT "SwapRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SwapRequest_pendingKey_key" ON "SwapRequest"("pendingKey");
CREATE INDEX IF NOT EXISTS "SwapRequest_tenantId_status_createdAt_idx" ON "SwapRequest"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SwapRequest_requesterPersonId_status_idx" ON "SwapRequest"("requesterPersonId", "status");
CREATE INDEX IF NOT EXISTS "SwapRequest_assignmentId_idx" ON "SwapRequest"("assignmentId");
