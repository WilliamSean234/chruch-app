-- CreateTable
CREATE TABLE "MeetingMinutes" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "agenda" TEXT NOT NULL DEFAULT '',
    "discussion" TEXT NOT NULL DEFAULT '',
    "decisions" TEXT NOT NULL DEFAULT '',
    "draftById" TEXT,
    "draftAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviseReason" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMinutesRevision" (
    "id" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "agenda" TEXT NOT NULL,
    "discussion" TEXT NOT NULL,
    "decisions" TEXT NOT NULL,
    "reason" TEXT,
    "authorId" TEXT,
    "draftAt" TIMESTAMP(3) NOT NULL,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingMinutesRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingMinutes_eventId_key" ON "MeetingMinutes"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingMinutesRevision_minutesId_version_key" ON "MeetingMinutesRevision"("minutesId", "version");

-- AddForeignKey
ALTER TABLE "MeetingMinutes" ADD CONSTRAINT "MeetingMinutes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinutesRevision" ADD CONSTRAINT "MeetingMinutesRevision_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "MeetingMinutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
