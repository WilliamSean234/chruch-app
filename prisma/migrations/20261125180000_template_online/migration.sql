-- Template acara online: tautan (terenkripsi), penerima tautan, dan saklar pengingat.
ALTER TABLE "EventTemplate"
  ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onlineUrl" TEXT,
  ADD COLUMN "onlineCommunityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "onlineReminder" BOOLEAN NOT NULL DEFAULT true;
