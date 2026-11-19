-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "floor" INTEGER;

-- CreateIndex
CREATE INDEX "Room_tenantId_floor_idx" ON "Room"("tenantId", "floor");
