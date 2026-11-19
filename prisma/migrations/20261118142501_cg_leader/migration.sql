-- CreateTable
CREATE TABLE "CgLeader" (
    "cgGroupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "CgLeader_pkey" PRIMARY KEY ("cgGroupId","personId")
);

-- AddForeignKey
ALTER TABLE "CgLeader" ADD CONSTRAINT "CgLeader_cgGroupId_fkey" FOREIGN KEY ("cgGroupId") REFERENCES "CgGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CgLeader" ADD CONSTRAINT "CgLeader_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
