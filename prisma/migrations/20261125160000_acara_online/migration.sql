-- Acara online (ibadah dan rapat kelompok): ruangan maya, tautan, pembicara, dan batas penerima tautan.
ALTER TABLE "Room" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Event"
  ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onlineUrl" TEXT,
  ADD COLUMN "speakerPersonId" TEXT,
  ADD COLUMN "speakerName" TEXT,
  ADD COLUMN "onlineCommunityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
