-- Tema ibadah, catatan padus, Band/No Band, dan penanda posisi khusus band.
ALTER TABLE "Event" ADD COLUMN "theme" TEXT,
ADD COLUMN "padus" TEXT,
ADD COLUMN "bandMode" TEXT NOT NULL DEFAULT 'BAND';

ALTER TABLE "Ministry" ADD COLUMN "bandOnly" BOOLEAN NOT NULL DEFAULT false;

-- Tim "Pimpinan ibadah" menjadi "Penatalayan ibadah", dan posisi Tim pemusik digabung ke dalamnya
-- (penatalayan bertanggung jawab atas pemusik, WL/Liturgos, Singer/Backing Vocal, dan PIC).
-- Aman diulang: yang sudah digabung dilewati. Posisi yang namanya sudah ada di Penatalayan ibadah tidak dipindah.
DO $$
DECLARE
  tn RECORD;
  lead_id TEXT;
  music_id TEXT;
  left_n INT;
BEGIN
  FOR tn IN SELECT DISTINCT "tenantId" FROM "TeamType" LOOP
    SELECT id INTO lead_id FROM "TeamType"
      WHERE "tenantId" = tn."tenantId" AND "deletedAt" IS NULL AND lower(btrim(name)) IN ('pimpinan ibadah', 'penatalayan ibadah')
      ORDER BY (lower(btrim(name)) = 'penatalayan ibadah') DESC LIMIT 1;
    SELECT id INTO music_id FROM "TeamType"
      WHERE "tenantId" = tn."tenantId" AND "deletedAt" IS NULL AND lower(btrim(name)) = 'tim pemusik' LIMIT 1;

    -- tim pimpinan tidak ada, tetapi tim pemusik ada: tim pemusik yang menjadi Penatalayan ibadah
    IF lead_id IS NULL AND music_id IS NOT NULL THEN
      lead_id := music_id;
      music_id := NULL;
    END IF;
    CONTINUE WHEN lead_id IS NULL;

    UPDATE "TeamType" SET name = 'Penatalayan ibadah', "isCore" = true
      WHERE id = lead_id AND name <> 'Penatalayan ibadah'
        AND NOT EXISTS (SELECT 1 FROM "TeamType" x WHERE x."tenantId" = tn."tenantId" AND x.name = 'Penatalayan ibadah' AND x.id <> lead_id);

    IF music_id IS NOT NULL THEN
      -- kursi di acara ikut pindah tim, hanya untuk posisi yang dipindah
      UPDATE "EventAssignment" ea SET "teamTypeId" = lead_id
        FROM "Ministry" m
        WHERE ea."ministryId" = m.id AND m."teamTypeId" = music_id
          AND NOT EXISTS (SELECT 1 FROM "Ministry" x WHERE x."teamTypeId" = lead_id AND lower(x.name) = lower(m.name));
      UPDATE "Ministry" m SET "teamTypeId" = lead_id
        WHERE m."teamTypeId" = music_id
          AND NOT EXISTS (SELECT 1 FROM "Ministry" x WHERE x."teamTypeId" = lead_id AND lower(x.name) = lower(m.name));

      -- acara yang aktif di tim pemusik sekarang aktif di Penatalayan ibadah
      INSERT INTO "EventTeam" (id, "eventId", "teamTypeId")
        SELECT gen_random_uuid()::text, et."eventId", lead_id FROM "EventTeam" et WHERE et."teamTypeId" = music_id
        ON CONFLICT ("eventId", "teamTypeId") DO NOTHING;

      SELECT count(*) INTO left_n FROM "Ministry" WHERE "teamTypeId" = music_id AND "deletedAt" IS NULL;
      IF left_n = 0 THEN
        DELETE FROM "EventTeam" WHERE "teamTypeId" = music_id;
        -- Admin Tim pemusik menjadi Admin Tim Penatalayan ibadah
        DELETE FROM "UserRole" ur WHERE ur."teamTypeId" = music_id
          AND EXISTS (SELECT 1 FROM "UserRole" o WHERE o."userId" = ur."userId" AND o."roleId" = ur."roleId" AND o."teamTypeId" = lead_id);
        UPDATE "UserRole" SET "teamTypeId" = lead_id WHERE "teamTypeId" = music_id;
        UPDATE "TeamType" SET "deletedAt" = now(), "isCore" = false WHERE id = music_id;
      ELSE
        -- masih ada posisi yang tertinggal (nama kembar): Admin Tim pemusik juga mengurus Penatalayan ibadah
        INSERT INTO "UserRole" (id, "userId", "roleId", "teamTypeId")
          SELECT gen_random_uuid()::text, ur."userId", ur."roleId", lead_id FROM "UserRole" ur WHERE ur."teamTypeId" = music_id
          ON CONFLICT ("userId", "roleId", "teamTypeId") DO NOTHING;
      END IF;
    END IF;

    -- posisi band: tidak dipakai di ibadah No Band
    UPDATE "Ministry" SET "bandOnly" = true
      WHERE "teamTypeId" IN (lead_id, music_id) AND lower(btrim(name)) IN ('bass', 'gitar', 'drum', 'kajon', 'cajon');
  END LOOP;
END $$;
