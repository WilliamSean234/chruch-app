-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "personId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSuperadmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "teamTypeId" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonPosition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CgGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CgGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "title" TEXT,
    "birthDate" DATE,
    "gender" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "cgGroupId" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'DALAM',
    "originChurch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonCommunity" (
    "personId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,

    CONSTRAINT "PersonCommunity_pkey" PRIMARY KEY ("personId","communityId")
);

-- CreateTable
CREATE TABLE "TeamType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TeamType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ministry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rehearsalRequiredDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ministry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonMinistry" (
    "personId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,

    CONSTRAINT "PersonMinistry_pkey" PRIMARY KEY ("personId","ministryId")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'WEEKLY',
    "ordinal" INTEGER,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 120,
    "roomId" TEXT NOT NULL,
    "attendanceModeDefault" TEXT NOT NULL DEFAULT 'COUNT',
    "attendanceCommunityId" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplateSlot" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "slotNo" INTEGER NOT NULL DEFAULT 1,
    "rehearsalRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventTemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "attendanceMode" TEXT NOT NULL DEFAULT 'COUNT',
    "publishedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTeam" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamTypeId" TEXT NOT NULL,

    CONSTRAINT "EventTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamTypeId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "slotNo" INTEGER NOT NULL DEFAULT 1,
    "personId" TEXT,
    "rehearsalRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RehearsalSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "roomId" TEXT NOT NULL,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RehearsalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendanceSummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAttendanceSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,

    CONSTRAINT "EventAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "isOverride" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_teamTypeId_key" ON "UserRole"("userId", "roleId", "teamTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonPosition_tenantId_name_key" ON "PersonPosition"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CgGroup_tenantId_name_key" ON "CgGroup"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Community_tenantId_name_key" ON "Community"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Person_tenantId_nameKey_idx" ON "Person"("tenantId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "TeamType_tenantId_name_key" ON "TeamType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Ministry_tenantId_teamTypeId_name_key" ON "Ministry"("tenantId", "teamTypeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_tenantId_name_key" ON "Room"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EventTemplate_tenantId_name_key" ON "EventTemplate"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EventTemplateSlot_templateId_ministryId_slotNo_key" ON "EventTemplateSlot"("templateId", "ministryId", "slotNo");

-- CreateIndex
CREATE INDEX "Event_tenantId_startsAt_idx" ON "Event"("tenantId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_tenantId_number_key" ON "Event"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "EventTeam_eventId_teamTypeId_key" ON "EventTeam"("eventId", "teamTypeId");

-- CreateIndex
CREATE INDEX "EventAssignment_tenantId_personId_idx" ON "EventAssignment"("tenantId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAssignment_eventId_ministryId_slotNo_key" ON "EventAssignment"("eventId", "ministryId", "slotNo");

-- CreateIndex
CREATE UNIQUE INDEX "RehearsalSession_eventId_seq_key" ON "RehearsalSession"("eventId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendanceSummary_eventId_key" ON "EventAttendanceSummary"("eventId");

-- CreateIndex
CREATE INDEX "EventAttendance_tenantId_personId_idx" ON "EventAttendance"("tenantId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendance_eventId_personId_key" ON "EventAttendance"("eventId", "personId");

-- CreateIndex
CREATE INDEX "Booking_tenantId_resourceType_resourceId_startsAt_idx" ON "Booking"("tenantId", "resourceType", "resourceId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_sourceType_sourceId_idx" ON "Booking"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DocSequence_tenantId_kind_period_key" ON "DocSequence"("tenantId", "kind", "period");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantId_key_key" ON "IdempotencyKey"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_teamTypeId_fkey" FOREIGN KEY ("teamTypeId") REFERENCES "TeamType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "PersonPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_cgGroupId_fkey" FOREIGN KEY ("cgGroupId") REFERENCES "CgGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCommunity" ADD CONSTRAINT "PersonCommunity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCommunity" ADD CONSTRAINT "PersonCommunity_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ministry" ADD CONSTRAINT "Ministry_teamTypeId_fkey" FOREIGN KEY ("teamTypeId") REFERENCES "TeamType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMinistry" ADD CONSTRAINT "PersonMinistry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMinistry" ADD CONSTRAINT "PersonMinistry_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_attendanceCommunityId_fkey" FOREIGN KEY ("attendanceCommunityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplateSlot" ADD CONSTRAINT "EventTemplateSlot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplateSlot" ADD CONSTRAINT "EventTemplateSlot_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeam" ADD CONSTRAINT "EventTeam_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeam" ADD CONSTRAINT "EventTeam_teamTypeId_fkey" FOREIGN KEY ("teamTypeId") REFERENCES "TeamType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssignment" ADD CONSTRAINT "EventAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssignment" ADD CONSTRAINT "EventAssignment_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssignment" ADD CONSTRAINT "EventAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RehearsalSession" ADD CONSTRAINT "RehearsalSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RehearsalSession" ADD CONSTRAINT "RehearsalSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendanceSummary" ADD CONSTRAINT "EventAttendanceSummary_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
