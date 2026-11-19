-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT,
    "guestName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingParticipant_eventId_idx" ON "MeetingParticipant"("eventId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_personId_idx" ON "MeetingParticipant"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_eventId_personId_key" ON "MeetingParticipant"("eventId", "personId");

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
