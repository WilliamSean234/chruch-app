-- Constraint anti-bentrok orang dan ruangan.
-- Tempel isi file ini ke migration.sql hasil: npx prisma migrate dev --create-only --name booking_no_overlap

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "tenantId"     WITH =,
    "resourceType" WITH =,
    "resourceId"   WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("deletedAt" IS NULL AND NOT "isOverride");
