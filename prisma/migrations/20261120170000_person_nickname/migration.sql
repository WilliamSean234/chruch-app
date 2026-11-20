-- AlterTable
ALTER TABLE "Person" ADD COLUMN "nickname" TEXT,
ADD COLUMN "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
