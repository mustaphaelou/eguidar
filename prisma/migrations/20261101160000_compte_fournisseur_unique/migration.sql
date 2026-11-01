-- Un Compte client peut lier plusieurs identités (Google, Facebook), mais une
-- identité de fournisseur (providerId, accountId) ne désigne qu'un seul Compte
-- client. Sans cette contrainte, une course entre deux connexions sociales
-- peut créer deux lignes pour la même identité.
--
-- Préflight : lister les paires déjà dupliquées. La requête doit rendre zéro
-- ligne avant d'appliquer la migration :
--
--   SELECT "providerId",
--          "accountId",
--          COUNT(*) AS "lignes",
--          array_agg("id" ORDER BY "createdAt", "id") AS "lignes_id",
--          array_agg("userId" ORDER BY "createdAt", "id") AS "comptes_clients"
--   FROM "account"
--   GROUP BY "providerId", "accountId"
--   HAVING COUNT(*) > 1
--   ORDER BY "providerId", "accountId";
--
-- La même vérification est disponible via
-- `npx tsx scripts/verifier-doublons-identites-fournisseur.ts` (sortie 1 en cas
-- de doublon, avec les identifiants des lignes et des Comptes clients).
--
-- Résolution manuelle d'un doublon :
--   1. lister les paires dupliquées avec la requête ci-dessus ;
--   2. décider, pour chaque paire, quelle ligne porte la véritable identité du
--      fournisseur (jetons les plus récents, dernière connexion) ;
--   3. fusionner ou supprimer l'autre ligne à la main, sans toucher aux autres
--      paires ;
--   4. consigner la décision dans le ticket #836 ;
--   5. marquer la migration interrompue comme annulée, puis relancer le
--      déploiement :
--        npx prisma migrate resolve --rolled-back 20261101160000_compte_fournisseur_unique
--        npx prisma migrate deploy
--
-- La migration ne supprime aucune ligne : elle refuse de s'appliquer tant
-- qu'un doublon subsiste, pour que la résolution reste une décision humaine.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "account"
    GROUP BY "providerId", "accountId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Doublons dans "account" : une paire (providerId, accountId) apparaît plusieurs fois. Résolvez-les à la main (voir le commentaire de la migration 20261101160000_compte_fournisseur_unique), puis relancez prisma migrate deploy.';
  END IF;
END
$$;

-- Une identité de fournisseur ne peut plus désigner deux Comptes clients.
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
