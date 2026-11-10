-- Spec #979 : au plus un Lot d'import en cours à la fois. La garantie est
-- l'index partiel lui-même, pas une lecture préalable : deux applications
-- concurrentes ne peuvent pas toutes deux passer un Lot à `en_cours`.
--
-- Prisma ne modélise pas les index partiels : le schéma reste sans `@@unique`,
-- et le test de concurrence de #986 est la garde.
--
-- La dérive préexistante de "Product_categoryId_fkey" (ON DELETE RESTRICT en
-- base, non déclaré dans le schéma) est volontairement ignorée : elle
-- n'appartient pas à ce ticket.

-- CreateIndex
CREATE UNIQUE INDEX "LotImport_un_seul_en_cours"
  ON "LotImport" ("statut")
  WHERE "statut" = 'en_cours';
