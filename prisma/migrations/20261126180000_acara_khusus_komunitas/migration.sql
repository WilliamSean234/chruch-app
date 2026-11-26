-- Acara (dan template acara) bisa dikhususkan untuk komunitas tertentu; anggotanya melihat acara itu di Jadwal saya.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "audienceCommunityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "EventTemplate" ADD COLUMN IF NOT EXISTS "audienceCommunityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
