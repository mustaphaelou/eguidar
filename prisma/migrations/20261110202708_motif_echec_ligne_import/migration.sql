-- Spec #979 : un Produit en échec d'écriture est enregistré avec sa raison sur
-- chacune de ses Lignes. Migration strictement additive : une colonne texte,
-- nullable, sans contrainte ni index.
--
-- La dérive préexistante de "Product_categoryId_fkey" (ON DELETE RESTRICT en
-- base, non déclaré dans le schéma) est volontairement ignorée : elle
-- n'appartient pas à ce ticket.

-- AlterTable
ALTER TABLE "LigneImport" ADD COLUMN     "motifEchec" TEXT;
