-- CreateTable
CREATE TABLE "BrouillonImageProduit" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tentativeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'vivant',
    "promotedPublicUrl" TEXT,
    "productId" TEXT,

    CONSTRAINT "BrouillonImageProduit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrouillonImageProduit_storageKey_key" ON "BrouillonImageProduit"("storageKey");

-- CreateIndex
CREATE INDEX "BrouillonImageProduit_ownerId_idx" ON "BrouillonImageProduit"("ownerId");

-- CreateIndex
CREATE INDEX "BrouillonImageProduit_tentativeId_idx" ON "BrouillonImageProduit"("tentativeId");

-- CreateIndex
CREATE INDEX "BrouillonImageProduit_state_expiresAt_idx" ON "BrouillonImageProduit"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "BrouillonImageProduit_productId_idx" ON "BrouillonImageProduit"("productId");

-- AddForeignKey
ALTER TABLE "BrouillonImageProduit" ADD CONSTRAINT "BrouillonImageProduit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrouillonImageProduit" ADD CONSTRAINT "BrouillonImageProduit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
