-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "personId" TEXT,
    "rejectReason" TEXT,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationRequest_tenantId_status_createdAt_idx" ON "RegistrationRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RegistrationRequest_ip_createdAt_idx" ON "RegistrationRequest"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "RegistrationRequest_tenantId_email_idx" ON "RegistrationRequest"("tenantId", "email");
