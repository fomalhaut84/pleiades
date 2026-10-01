-- CreateTable
CREATE TABLE "WhooingConfig" (
    "id" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "defaultRight" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhooingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhooingCategoryMap" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "whooingLeft" TEXT NOT NULL,
    "whooingRight" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhooingCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhooingCategoryMap_categoryId_key" ON "WhooingCategoryMap"("categoryId");

-- AddForeignKey
ALTER TABLE "WhooingCategoryMap" ADD CONSTRAINT "WhooingCategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
