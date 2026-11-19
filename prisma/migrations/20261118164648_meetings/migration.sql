-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'IBADAH',
ADD COLUMN     "showAttendees" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showTopic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MeetingLink" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingLink_eventId_idx" ON "MeetingLink"("eventId");

-- CreateIndex
CREATE INDEX "Event_tenantId_kind_startsAt_idx" ON "Event"("tenantId", "kind", "startsAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MeetingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingLink" ADD CONSTRAINT "MeetingLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
