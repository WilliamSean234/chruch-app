-- Acara online: saklar pengingat H-1 per acara (bawaan menyala).
ALTER TABLE "Event" ADD COLUMN "onlineReminder" BOOLEAN NOT NULL DEFAULT true;
