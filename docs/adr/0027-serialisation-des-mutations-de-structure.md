# Les mutations de Structure sont sérialisées

La spec #417 a fait de la réaffectation de suppression une seule mutation committée, et a laissé
exprès la sérialisation de côté : ADR-0014 garantit l'atomicité, rien de plus. #431, ouvert par ce
choix, demandait de décider avant que l'Administration ne s'y fie. Nous avons vérifié les courses
résiduelles, et l'une d'elles ne se comportait pas comme l'issue le décrivait.

Sous READ COMMITTED (le défaut de Prisma, que rien ne surcharge aujourd'hui), `deleteCategory`
ne sérialise pas. Un Produit créé concurremment sur la Structure source fait échouer la suppression
finale sur `Product_categoryId_fkey` — l'intégrité tient, la réaffectation est annulée, mais
l'éditeur reçoit une erreur de base. Pire, une Structure enfant rattachée concurremment sous la
source : `Category_parentId_fkey` est en `ON DELETE SET NULL`, pas `RESTRICT` — la suppression
**réussit** et l'enfant est silencieusement promu au rang de racine. La course ne dégrade pas la
qualité du refus, elle perd un fait. Comme `adminFormAction` relance toute erreur qui n'est pas un
`UserFacingError` ([`mutation-actions.ts:107-114`](../../lib/use-cases/mutation-actions.ts#L107-L114)),
la première de ces courses sortait aussi de l'action serveur en exception non rattrapée.

## Décision

- **Les mutations de Structure sont sérialisées.** Une seule promesse, énonçable en une phrase :
  deux mutations de Structure ne s'entrelacent jamais. Elle vaut pour `createCategory`,
  `updateCategory` et `deleteCategory`, pas seulement pour la suppression.

- **Le verrou est grossier et prend tout l'arbre.** `SELECT … FROM "Category" FOR UPDATE`, en SQL
  brut, première instruction de la transaction de chaque mutation de Structure. Verrouiller chaque
  Structure plutôt que le nœud visé est ce qui ferme la course de cycle : `assertAcyclicCategoryTree`
  parcourt une chaîne d'ancêtres arbitraire, qu'un verrou de nœud ne protège pas. Personne n'échappe
  au verrou, **pas même la création d'une Structure racine** : deux créations de racines concurrentes
  s'exécutent bien en série, PostgreSQL sérialisant sur les lignes existantes
  ([épreuve](#comment-ce-résultat-a-été-éprouvé)). C'est sans conséquence — deux racines distinctes ne
  partagent aucun invariant — mais c'est le comportement, pas une exception à énoncer.

- **`createCategory` et `updateCategory` gagnent une transaction.** Elles n'en avaient aucune, et
  `assertAcyclicCategoryTree` lisait la chaîne des parents sur le client `prisma` nu : elle ne
  pouvait pas voir l'état non committé d'une transaction. Le verrou n'a de sens que dans une
  transaction.

- **`SET LOCAL lock_timeout` suit immédiatement le verrou**, et son dépassement devient un
  `UserFacingError` (« la Structure est en cours de modification, réessayez »). Aucun
  `lock_timeout` ni `statement_timeout` n'existe dans ce dépôt : sans lui, l'attente ne s'éternise
  que jusqu'au délai Prisma côté client, 5 000 ms par défaut. Fail-fast vaut mieux qu'une transaction
  pendante qui bloque tout le monde.

- **La surface d'erreurs est totale du côté Structure.** Toute issue d'une mutation de Structure est
  un `UserFacingError`, jamais une erreur de lecteur : une violation de clé étrangère et un dépassement
  de verrou y sont traduits en Refus de la Structure. C'est une exigence autonome de la garantie, pas
  une conséquence du verrou : la prévention peut toujours être contournée par le jour où une
  Tierce partie écrirait dans la Structure sans passer par cette interface. **Elle ne s'étend pas au
  Catalogue** — voir le piège nommé sur `Product_categoryId_fkey`.

- **`lib/use-cases/admin-structure.ts` est propriétaire du verrou.** Le squelette partagé
  n'apprend aucun terme de base de données (ADR-0025), et un `SELECT … FOR UPDATE` contre une table
  nommée en est un bien plus lourd que le prédicat `hasUniqueViolation` que cet ADR avait déjà
  refusé d'y loger. **ADR-0025 n'est donc pas amendé** — il reste tel quel.

- **La frontière est la Structure.** Commande, Catalogue et Livraison gardent READ COMMITTED et
  leurs courses actuelles. **ADR-0014 n'est pas amendé** : la sérialisation s'y ajoute, elle ne le
  contredit pas. Son invariant — la base fait foi, les effets post-commit sont best-effort —
  reste le même, réindexation comprise.

### Ce que la sérialisation ferme

L'ordre des deux transactions décide de qui perd, et il n'est pas le même selon la course. Les
deux sens sont éprouvés ([épreuve](#comment-ce-résultat-a-été-éprouvé)) ; « la transaction tierce »
est celle qui n'est pas une mutation de Structure.

| Course                                                                | Avant                                                                                                            | Après                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| La transaction tierce insère un Produit, **puis** la suppression part | la lecture la rate, la suppression échoue sur `Product_categoryId_fkey`, l'erreur brute sort de l'action serveur | la suppression **attend** le verrou `FOR KEY SHARE` de l'insertion, la voit, et la réaffecte : **plus aucune erreur**      |
| La suppression prend le verrou, **puis** la transaction tierce insère | même erreur brute, même issue                                                                                    | l'insertion attend le verrou, puis meurt sur `Product_categoryId_fkey` — **erreur du côté Catalogue**, voir le piège nommé |
| Structure enfant rattachée sous la source                             | **promue silencieusement à la racine**                                                                           | le rattachement attend le verrou, puis meurt sur `Category_parentId_fkey` → **Refus de la Structure**                      |
| Deux suppressions concurrentes                                        | erreur `P2025` de lecteur                                                                                        | la seconde attend, puis voit l'absence → `CategoryNotFoundError`                                                           |
| Deux réaffectations concurrentes                                      | l'index peut refléter un entrelacement qui n'a jamais existé                                                     | sérialisées : jamais                                                                                                       |
| Cycle par rattachement concurrent d'un ancêtre                        | deux mises à jour pouvaient s'entrelacer                                                                         | fermé — c'est le but du verrou grossier                                                                                    |

La première ligne est la seule où la garantie **améliore** une course au lieu de la translator : la
suppression attend, voit le Produit arrivé entre-temps, et le réaffecte. C'est le comportement
voulu, et c'est aussi celui qui force la réécriture du test d'entrelacement existant.

## Options écartées

- **`SERIALIZABLE` avec réessai** — correct par construction sur toutes les courses, mais déplace la
  garantie au niveau de la transaction plutôt que de la ligne, exige une boucle de réessai qui
  n'existe nulle part dans ce dépôt (aucune occurrence de `P2034`, `40001`, `40P01` ni de backoff),
  et fait payer un abandon-reprise à chaque mutation. Le verrou de ligne laisse cette porte ouverte
  plus tard : une stratégie de réessai aurait de toute façon besoin du verrou.
- **Un verrou par nœud** — meilleure concurrence, mais `assertAcyclicCategoryTree` parcourt une
  chaîne d'ancêtres ; verrouiller le seul nœud déplacé laisse libre le rattachement concurrent d'un
  de ses ancêtres, qui crée un cycle qu'aucune des deux transactions n'a vu.
- **Un verrou consultatif global** (`pg_advisory_xact_lock`) — l'expression la plus nette d'un verrou
  par Structure, sans balayage ni sentinelle. Écarté parce qu'il introduit un second vocabulaire de
  verrouillage dans un dépôt qui n'en a aucun, et qu'une structure verrouillée par ses propres
  lignes suffit.
- **Une ligne de sentinelle dans une table dédiée** — explicite, mais une nouvelle table et une
  migration pour un verrou qui a déjà une maison.
- **Accepter le comportement actuel** — la course 1 est prouvée par un test existant, la course 2
  perd un fait, et l'une comme l'autre sortent du Refus de la Structure. Ce n'était pas tenable.
- **Traduire les erreurs sans rien verrouiller** — améliore la course 1 et laisse la course 2
  perdre son fait en silence. Le refus serait plus propre ; le bug resterait.

## Invariants

- **Piège nommé — `Category_parentId_fkey` est en `ON DELETE SET NULL`**
  ([`20260810111743_init/migration.sql:236`](../../prisma/migrations/20260810111743_init/migration.sql#L236)).
  Inatteignable en production : `deleteCategory` refuse une Structure qui a des enfants avant
  d'atteindre son unique `tx.category.delete`. Aucun test, seed ou script ne s'y fie. Mais cette
  contrainte **contredit** la décision « une Structure qui a des enfants n'est jamais supprimable »,
  et le schéma Prisma [`schema.prisma:86-88`](../../prisma/schema.prisma#L86-L88) ne porte aucun
  `onDelete` — le schéma et la base divergent exactement ici. La contrainte est **laissée telle
  quelle**, et l'écart est consigné. La corriger exigerait de passer en `ON DELETE RESTRICT`, ce que
  PostgreSQL ne permet pas au sein d'une même instruction : 23 sites de nettoyage de test, répartis
  sur 21 fichiers, suppriment parent et enfant d'un seul `deleteMany`, et l'assertion parent-enfant
  existante ([`admin-structure.test.ts:489-512`](../../lib/use-cases/admin-structure.test.ts#L489-L512))
  attend que les deux survivent. Faire ce travail serait un changement à part entière, avec ses 21
  fichiers de test.

- **Piège nommé — `Product_categoryId_fkey` échoue toujours du côté Catalogue, jamais du côté
  Structure.** Quand la suppression tient le verrou, un Produit créé sur la Structure source attend
  puis meurt sur cette contrainte — SQLSTATE `23503`, code Prisma `P2003`. Cette erreur sort de
  `createProduct`, pas de `deleteCategory` : elle n'est donc **pas** traduite par la surface d'erreurs
  décidée ici, qui ne vaut que pour la Structure. Le comportement n'est pas neuf — sans verrou, la même
  insertion mourait de la même façon — mais le verrou lui donne une fenêtre définie, et un lecteur
  pressé y verra une régression. Le Catalogue reste hors de cette décision ; le traduire serait un
  chantier à part.

- **Piège nommé — la marche de `assertAcyclicCategoryTree` est non bornée**
  ([`lib/use-cases/admin-structure.ts:167-181`](../../lib/use-cases/admin-structure.ts#L167-L181)) :
  ni ensemble de structures visitées, ni plafond de profondeur, et elle compte sur l'absence de cycle
  dans les données. Le verrou empêche d'en **former** un ; un cycle déjà présent fait simplement
  tourner la marche jusqu'au délai de 5 000 ms. Suivi à part.

- **Aucun nouveau module, aucune couche de réessai.** Le verrou et la traduction vivent dans
  `lib/use-cases/admin-structure.ts`. `lib/use-cases/mutation-squelette.ts` n'apprend ni table, ni
  verrou, ni SQL (ADR-0025).

- **La réindexation reste best-effort et post-commit** (ADR-0014). La sérialisation garantit que les
  faits projetés dans la transaction sont ceux d'un état committed, pas qu'une réindexation ne peut
  pas échouer. Un index périmé après un échec reste le compromis d'ADR-0014, pas une course.

- **Le test d'entrelacement d'aujourd'hui s'inverse, il ne se corrige pas.**
  [`admin-structure.test.ts:800-895`](../../lib/use-cases/admin-structure.test.ts#L800-L895) fait
  insérer un Produit fantôme par une transaction tierce, **qui retient son commit**, puis lance la
  suppression. Sous le verrou grossier, la première instruction de la suppression bloque sur le
  `FOR KEY SHARE` que cette insertion tient, le fantôme devient visible, et la suppression
  **committe** : elle réaffecte le fantôme et retire la source. L'assertion du test — un rejet
  `PrismaClientKnownRequestError` — devient fausse. Il faut le réécrire pour prouver le résultat
  nouveau, et ajouter le cas symétrique (suppression verrouillée d'abord, insertion qui meurt).
  Le motif lui-même reste valable : `vitest.config.ts:17` impose `fileParallelism: false`, la suite
  pointe vers un vrai PostgreSQL (`test/setup.ts:4`), et le cas coûte ~550 ms de sommeil réel.

- **Frontière explicite :** Commande, Catalogue et Livraison gardent READ COMMITTED. Cette décision
  ne les engage pas et ne leur impose rien.

## Comment ce résultat a été éprouvé

Le tableau ci-dessus ne repose pas sur un raisonnement. Chaque case a été jouée contre un vrai
PostgreSQL — celui de `TEST_DATABASE_URL` — avec deux connexions concurrentes et deux tables jetables
reproduisant les contraintes exactes du dépôt (`ON DELETE SET NULL` sur la parenté, `ON DELETE RESTRICT`
sur les Produits), le verrou étant pris par `SELECT id FROM <catégorie> FOR UPDATE` en première
instruction, comme la décision le prescrit. Les tables ont été supprimées après l'épreuve ; rien n'a
touché la base de données du projet.

| Cas                                                               | Constat mesuré                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Insertion tierce engaged et commit retenu, suppression ensuite    | la suppression **attend**, voit 1 Produit, le réaffecte, **committe** — 0 erreur |
| Suppression verrouillée d'abord, insertion tierce ensuite         | l'insertion **attend**, puis `23503` sur la contrainte Produits                  |
| Rattachement d'un enfant sous la source verrouillée               | le rattachement **attend**, puis `23503` sur la contrainte de parenté            |
| Deux créations de racines concurrentes                            | **sérialisées** — ≈ 650 ms pour deux transactions de 300 ms                      |
| Deux suppressions concurrentes de la même source                  | la seconde attend, voit l'absence, rend un refus métier — jamais `P2025`         |
| `SET LOCAL lock_timeout = '300ms'` sous contention                | `55P03` en 303 ms — un refus net, pas une attente indéfinie                      |
| **Sans verrou**, rattachement concurrent sous la source           | l'enfant **survit, promu silencieusement au rang de racine** — le fait perdu     |
| Suppression verrouillée + `lock_timeout = '400ms'`, insert en vol | `55P03` en 403 ms                                                                |

La ligne **« Sans verrou »** est la raison d'être de cette décision : c'est le seul constat qui ne
soit pas un refus, et c'est le seul que le verrou fait disparaître.

## Amendement — Le refus de supprimer une Structure à enfants devient saisissable (#519)

[#519](https://github.com/eloaurdi/eguidar/issues/519), dans le chantier ouvert par
[#517](https://github.com/eloaurdi/eguidar/issues/517), a rendu la suppression d'une Structure qui
a des sous-catégories possible : le formulaire propose une Structure d'accueil, et `deleteCategory`
la reçoit. Le premier piège nommé énonce donc une phrase devenue fausse —
« Inatteignable en production : `deleteCategory` refuse une Structure qui a des enfants avant
d'atteindre son unique `tx.category.delete` » n'est plus exact. Aucune ligne d'ici n'est
changée ; ce qui suit dit ce qui s'est réellement déplacé.

- **Le refus est devenu conditionnel à une cible choisie, et il reste le refus par défaut.**
  `deleteCategory` refuse toujours une Structure qui a des enfants lorsqu'aucun
  `reparentChildrenToCategoryId` n'est fourni — cas par défaut, et seule issue quand le
  formulaire n'envoie rien. La règle ne s'est pas assoupplie : elle est devenue saisissable. Le
  refus, lui, demeure atteignable et demeure l'issue quand l'éditeur choisit de ne pas déplacer.

- **Le réattribut précède la suppression, dans la transaction.** C'est ce qui tient le piège
  nommé plutôt que de le rendre seulement improbable : `Category_parentId_fkey` est en
  `ON DELETE SET NULL`, et une suppression sans réattribut promouvrait silencieusement les
  enfants au rang de racine. L'écriture des `parentId` passe par le client `tx`, avant l'unique
  `tx.category.delete`, sous le même verrou `FOR UPDATE` : la promotion silencieuse n'a plus
  d'issue, et le piège reste vrai quant à l'écart entre le schéma Prisma et la base, que cet
  amendement ne corrige pas.

- **La marche d'acyclicité suit le même chemin.** Le réattribut est validé contre la transaction
  et non contre le client nu, pour ne lire que des faits engagés.

- **La sérialisation de [#431](https://github.com/eloaurdi/eguidar/issues/431) est intacte.**
  Le verrou grossier, le `SET LOCAL lock_timeout`, la surface d'erreurs, le propriétaire du
  verrou et la frontière énoncée restent exactement ce qu'ils étaient. Les deux autres pièges
  nommés aussi : `Product_categoryId_fkey` échoue toujours du côté Catalogue, et la marche de
  `assertAcyclicCategoryTree` reste non bornée — en particulier sans ensemble de structures
  visitées, ce que cet amendement ne corrige pas.
