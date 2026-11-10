-- Spec #979 : un fichier téléversé devient un Lot d'import, et ses lignes
-- deviendront des Lignes d'import. Migration strictement additive : elle ne
-- touche aucune table existante. L'index partiel qui garantit un seul Lot
-- « en_cours » appartient au ticket #986 et n'est pas créé ici.

-- CreateEnum
CREATE TYPE "StatutLotImport" AS ENUM ('brouillon', 'verifie', 'en_cours', 'partiel', 'termine', 'echoue');

-- CreateEnum
CREATE TYPE "StatutLigneImport" AS ENUM ('a_creer', 'a_modifier', 'inchangee', 'refusee', 'ecrite', 'echouee');

-- CreateTable
CREATE TABLE "LotImport" (
    "id" TEXT NOT NULL,
    "auteurId" TEXT,
    "empreinte" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "statut" "StatutLotImport" NOT NULL DEFAULT 'brouillon',
    "curseur" INTEGER NOT NULL DEFAULT 0,
    "produitsCrees" INTEGER NOT NULL DEFAULT 0,
    "produitsModifies" INTEGER NOT NULL DEFAULT 0,
    "produitsInchanges" INTEGER NOT NULL DEFAULT 0,
    "produitsRefuses" INTEGER NOT NULL DEFAULT 0,
    "ecrits" INTEGER NOT NULL DEFAULT 0,
    "indexes" INTEGER NOT NULL DEFAULT 0,
    "avertissements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "motifEchec" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneImport" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "cellules" JSONB NOT NULL,
    "enregistrement" JSONB,
    "codeRefus" TEXT,
    "avertissements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diff" JSONB,
    "statut" "StatutLigneImport",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LigneImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotImport_createdAt_idx" ON "LotImport"("createdAt");

-- CreateIndex
CREATE INDEX "LotImport_statut_idx" ON "LotImport"("statut");

-- CreateIndex
CREATE INDEX "LigneImport_lotId_slug_idx" ON "LigneImport"("lotId", "slug");

-- CreateIndex
CREATE INDEX "LigneImport_lotId_statut_idx" ON "LigneImport"("lotId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "LigneImport_lotId_numero_key" ON "LigneImport"("lotId", "numero");

-- AddForeignKey
ALTER TABLE "LotImport" ADD CONSTRAINT "LotImport_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneImport" ADD CONSTRAINT "LigneImport_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "LotImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
