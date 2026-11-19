-- CreateTable
CREATE TABLE "MeetingGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quorumMin" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPosition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "canSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canWriteMinutes" BOOLEAN NOT NULL DEFAULT false,
    "canFinalize" BOOLEAN NOT NULL DEFAULT false,
    "canManageMembers" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GroupPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMemberPosition" (
    "memberId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,

    CONSTRAINT "GroupMemberPosition_pkey" PRIMARY KEY ("memberId","positionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingGroup_tenantId_name_key" ON "MeetingGroup"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPosition_groupId_name_key" ON "GroupPosition"("groupId", "name");

-- CreateIndex
CREATE INDEX "GroupMember_personId_idx" ON "GroupMember"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_personId_key" ON "GroupMember"("groupId", "personId");

-- AddForeignKey
ALTER TABLE "GroupPosition" ADD CONSTRAINT "GroupPosition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MeetingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MeetingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMemberPosition" ADD CONSTRAINT "GroupMemberPosition_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMemberPosition" ADD CONSTRAINT "GroupMemberPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "GroupPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
