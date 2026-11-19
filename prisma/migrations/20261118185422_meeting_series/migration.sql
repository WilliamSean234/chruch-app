-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "seriesIndex" INTEGER;

-- CreateTable
CREATE TABLE "MeetingSeries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "ordinal" INTEGER,
    "total" INTEGER NOT NULL,
    "untilDate" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSeries_tenantId_groupId_idx" ON "MeetingSeries"("tenantId", "groupId");

-- CreateIndex
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MeetingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
