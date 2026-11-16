# Les horodatages portent leur fuseau

Les colonnes temporelles du schéma étaient des `timestamp(3)` sans fuseau. Prisma mappe un
`DateTime` sur ce type par défaut : une valeur ne dit pas quel instant elle représente. Un
`timestamp` est lu et écrit selon le `TimeZone` de la session ; une connexion réglée autrement que
le serveur décale les instants sans erreur, et deux horodatages qui semblaient comparables ne le
sont plus. Les échéances de la boutique — fenêtre de rétractation, date de livraison, purge des
Brouillons d'Image produit, automatisations durables — dépendent toutes d'un instant exact.

La base de production répond `UTC`, et les valeurs existantes ont été écrites à l'heure UTC par
l'application. Les lire comme UTC au moment de la conversion ne déplace donc aucun instant.

## Décision

- **Tout `DateTime` du schéma est un `timestamptz(3)`.** Les 50 champs temporels des 22 tables
  portent `@db.Timestamptz(3)`, y compris les tables de la bibliothèque d'authentification. Un
  champ ajouté sans cette annotation recréerait un `timestamp(3)` : la garde le refuse.

- **Une seule migration convertit toutes les colonnes, en une transaction.**
  `20261115235000_horodatages_avec_fuseau` contient une instruction `ALTER TABLE … ALTER COLUMN …
  SET DATA TYPE TIMESTAMPTZ(3)` par colonne, dans l'ordre du schéma. Elle ne supprime ni ne renomme
  rien : la base garde les mêmes colonnes, les mêmes noms et les mêmes données.

- **La conversion lit les valeurs existantes comme UTC, et le dit.** Chaque instruction porte
  `USING "<colonne>" AT TIME ZONE 'UTC'`. Un `SET DATA TYPE` sans `USING` convertirait selon le
  `TimeZone` de la session qui applique la migration — Prisma, psql et un opérateur peuvent ne pas
  être d'accord — et déplacerait les instants d'un nombre d'heures silencieux. Le `USING` rend le
  fuseau de lecture indépendant de la session.

- **La précision reste à trois millisecondes.** `timestamptz(3)` est l'équivalent exact de
  l'ancien `timestamp(3)` : les valeurs existantes ne perdent rien et les défauts
  `CURRENT_TIMESTAMP` continuent de produire le même instant.

- **`_prisma_migrations` n'est pas touchée.** Cette table appartient à Prisma et ses trois
  colonnes temporelles sont déjà des `timestamptz`. La migration ne la nomme pas.

- **Aucun appelant ne change.** Prisma rend un `DateTime` dans les deux cas ; les lectures, les
  écritures et les comparaisons restent identiques, et les suites existantes passent sans réécrire
  leurs assertions de dates.

- **La migration a été exercée d'abord sur le point de restauration vérifié, puis sur la base de
  test.** Sur `eguidar_restauration_20261115T233421Z` (121 lignes, 16 migrations), chaque colonne
  temporelle a été empreintée avant et après : mêmes instants, mêmes comptes. La base de test a
  ensuite reçu la migration par `prisma migrate deploy`, et il ne reste aucune colonne
  `timestamp without time zone`.

- **La garde vit dans les tests.** `prisma/migrations/horodatages-avec-fuseau.test.ts` vérifie que
  chaque `DateTime` du schéma est annoté, que chaque colonne reçoit son `ALTER` avec
  `USING … AT TIME ZONE 'UTC'`, qu'aucun horodatage sans fuseau ne subsiste dans
  `information_schema`, et qu'une valeur de référence garde son instant quand la session est dans
  un autre fuseau.

## Conséquences

- Un instant est comparable et ordonnable d'une session à l'autre, quel que soit le `TimeZone` du
  client SQL. Une valeur lue par l'application ne dépend plus du réglage de la connexion.
- La migration réécrit chaque table et prend un verrou exclusif le temps de sa transaction. Sur le
  point de restauration mesuré, 121 lignes et 50 colonnes ; le coût suit la taille des tables au
  moment du déploiement.
- Les tables Better Auth sont converties comme les autres. Elles ne changent pas de forme pour la
  bibliothèque : les colonnes gardent leur nom et leur type Prisma.
- Toute future colonne temporelle doit porter `@db.Timestamptz(3)`. La garde échoue avant qu'un
  `timestamp(3)` ne revienne.

## Options écartées

- **`SET DATA TYPE TIMESTAMPTZ(3)` sans `USING`.** La conversion dépendrait du `TimeZone` de la
  session de migration. Rejeté : le résultat ne serait pas le même selon l'outil qui applique la
  migration.
- **Garder `timestamp` et documenter une convention « toujours UTC ».** Rejeté : la convention ne
  survit ni à une connexion réglée autrement, ni à un nouveau champ oublié ; rien dans la base ne
  la fait respecter.
- **Convertir en `timestamptz(6)`.** Rejeté : la précision par défaut de Prisma pour `timestamptz`
  ne rend pas le changement utile, et `(3)` est la précision déjà déclarée par les données.
- **Une migration par table.** Rejeté : une exécution partielle laisserait les horodatages dans
  deux types à la fois ; une seule transaction rend la bascule tout ou rien.
- **Utiliser `Etc/UTC` plutôt que `UTC`.** Rejeté : les deux désignent le même fuseau, mais `UTC`
  est le nom que la spec et la base emploient.

## Hors du périmètre

- Le formatage des dates dans l'interface : cette décision porte sur le stockage, pas sur
  l'affichage.
- Les nouveaux champs datés de la spec #1025 (`deliveredAt`, `collectedAt`, `requestedAt`,
  `changedAt`) : ils naissent `timestamptz` dans les tickets qui les ajoutent.
- Le réglage du `TimeZone` du serveur PostgreSQL déployé ; la conversion ne dépend plus de lui.
