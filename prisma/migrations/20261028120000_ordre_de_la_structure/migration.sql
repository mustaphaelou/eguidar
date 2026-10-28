-- La Structure gagne une position explicite parmi ses sœurs. La migration est
-- additive : toutes les rangées existantes démarrent à zéro, et le nom en
-- français continue de départager, donc l'ordre visible ne change pas avant le
-- premier déplacement. Aucune contrainte d'unicité sur la fratrie en v1 : les
-- racines y échapperaient (SQL tient les NULL pour distincts), et l'unique
-- commande de déplacement fournit déjà la garantie.
ALTER TABLE "Category" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Category_parentId_position_idx" ON "Category"("parentId", "position");
