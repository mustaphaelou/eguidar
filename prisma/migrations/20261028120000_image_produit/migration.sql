-- Le registre des Images produit : une ligne par URL publique persistée, écrite
-- après l'enregistrement d'un Produit, jamais dans sa transaction. La clé
-- naturelle est l'URL publique (ADR-0004), et l'alt est un fait de l'asset.
CREATE TABLE "ImageProduit" (
    "id" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "alt" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageProduit_pkey" PRIMARY KEY ("id")
);

-- Une URL publique ne désigne qu'un seul asset : l'upsert qui réécrit le
-- registre après un enregistrement reste donc idempotent.
CREATE UNIQUE INDEX "ImageProduit_publicUrl_key" ON "ImageProduit"("publicUrl");
