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

## Amendement — La première tranche : `deleteCategory` seule (#487)

Les trois tranches se valent ensemble, mais elles ne se livrent pas ensemble :
[#487](https://github.com/eloaurdi/eguidar/issues/487) a posé la première — la seule des trois qui
ouvrait déjà sa transaction — et `createCategory` comme `updateCategory` gardent `READ COMMITTED`
et leurs courses jusqu'à [#488](https://github.com/eloaurdi/eguidar/issues/488) et
[#489](https://github.com/eloaurdi/eguidar/issues/489).

**La décision est prise, pas livrée.** Ce qui précède reste entier, et plusieurs de ses phrases ne
sont vraies que de `deleteCategory` tant que les deux autres tranches ne sont pas tombées : « Elle
vaut pour `createCategory`, `updateCategory` et `deleteCategory` », « première instruction de la
transaction de **chaque** mutation de Structure », « `createCategory` et `updateCategory` gagnent
une transaction », « toute issue d'une mutation de Structure est un `UserFacingError` ». Les lire
comme accomplies serait faux dès aujourd'hui ; ce qui suit dit ce que la tranche a réellement
tranché, et rien de plus.

- **Le `lock_timeout` vaut 1000 ms.** La décision dit qu'il existe, jamais combien. Mille
  millisecondes tient sous le délai d'une transaction interactive Prisma — 5 000 ms par défaut —
  et laisse à une mutation de Structure, qui se compte en quelques millisecondes, de quoi attendre
  une transaction tierce sans devenir jamais la transaction pendante que la décision refuse. Le
  délai est exporté (`DELAI_VERROU_STRUCTURE_MS`) : l'épreuve de contention doit savoir jusqu'où
  elle peut attendre avant de conclure qu'un refus vient du verrou, et non d'une contrainte.

- **Le `SET LOCAL` s'écrit `SELECT set_config('lock_timeout', …, true)`.** Même énoncé, autre
  forme : PostgreSQL n'accepte pas de paramètre dans un `SET`, et Prisma envoie toute requête
  `$queryRaw` préparée. Le délai reste ainsi une valeur, jamais du texte.

- **Le SQLSTATE décide ; le code Prisma ne départage que ce qu'il sait seul.** Relevé contre
  PostgreSQL, pas supposé : `meta.driverAdapterError.cause.originalCode` vaut `55P03` au
  dépassement et `23001` sur la violation de `Product_categoryId_fkey`. Prisma revêt l'une et
  l'autre de `P2039` ici ; `P2003` reste accepté parce qu'il est réservé aux clés étrangères
  ailleurs. La classe entière n'est pas retenue : seuls `23001` et `23503` le sont, la transaction
  de suppression n'écrivant que des `parentId` et des `categoryId`. Un dépassement de verrou et une
  violation d'intégrité rendent le **même** refus — `CategoryBusyError`, « la Structure est en
  cours de modification, réessayez » — parce que l'éditeur n'a qu'une chose à faire, et qu'une
  épreuve doit pouvoir dire laquelle des deux routes elle éprouve.

- **Une phrase de la décision est devenue fausse** : « Aucun `lock_timeout` ni `statement_timeout`
  n'existe dans ce dépôt ». Il en existe un depuis cette tranche, et il n'appartient qu'à la
  transaction de suppression.

- **Ce que la tranche ne ferme pas.** L'attente que le verrou grossier lui-même impose n'est pas
  bornée par ce `lock_timeout`, qui le suit : elle reste bornée par le délai de Prisma, et son
  dépassement reste une erreur de lecteur. Changer l'ordre des deux instructions — le délai avant
  le verrou — est une autre décision, et ce n'est pas celle-ci. **Elle a été prise depuis**, et
  l'amendement ci-dessous dit ce qu'elle a fermé.

### Le piège que le verrou grossier ouvre, et qui n'existait pas

Le verrou prend les Structures avant les Produits ; toute écriture du Catalogue prend le Produit
avant la Structure — `updateProduct` verrouille la ligne du Produit, puis la clé étrangère prend la
Structure. Les deux ordres sont inverses et peuvent se croiser. C'est une conséquence directe du
verrou grossier : avant lui, la suppression écrivait dans le même ordre que le Catalogue.

Le cycle, tendu sans course, est **coupé par le délai** et non par le détecteur : PostgreSQL ne
lève `40P01` qu'une seconde après la formation du cycle, alors que l'attente de la suppression a
commencé avant — mesuré contre cette base, `55P03` à 1 021 ms. `40P01` reste traduit par la même
fonction, pour le jour où `deadlock_timeout` serait plus court que le délai ; cette route n'est pas
éprouvée par une suite, et il ne faut pas le dire autrement.

### Ce que l'épreuve montre

Joué contre un vrai PostgreSQL, deux connexions concurrentes, dans
[`admin-structure.test.ts`](../../lib/use-cases/admin-structure.test.ts) :

| Cas                                                                                  | Constat mesuré                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Une tierce engage un Produit fantôme et retient son commit, la suppression part ensuite | la suppression **attend** le verrou, voit le Produit, le réaffecte, committe |
| Deux suppressions concurrentes de la même source                                    | la seconde attend, puis voit l'absence : `CategoryNotFoundError`, jamais `P2025` |
| La suppression tient le verrou, une insertion part ensuite                          | l'insertion attend, puis meurt sur `Product_categoryId_fkey` — **du côté Catalogue** |
| Une tierce tient un verrou de ligne sur un Produit déplacé                          | `lock_timeout` coupe en 1 000 ms : `CategoryBusyError`, rien n'a été écrit      |
| Une tierce écrit dans la Structure sans prendre le verrou                           | `Product_categoryId_fkey` : `CategoryBusyError`, transaction entière rétractée |
| Une tierce tient le Produit puis réclame la Structure                               | l'ordre inverse ne produit aucun interblocage : le délai coupe, refus encore   |

La troisième ligne est le cas symétrique qu'exige la décision, et il reste une erreur de lecteur
— celle de `createProduct`, que le Catalogue ne traduit pas. C'est le piège nommé que la décision
assume : la surface d'erreurs décidée ici ne vaut que pour la Structure.

La cinquième ligne est la Tierce partie que la décision nomme, et elle réclame une base de test
appartenant à un superutilisateur — `session_replication_role = 'replica'` écrit dans la Structure
sans déclencher la clé étrangère, donc sans prendre le `FOR KEY SHARE` que le verrou grossier
attend. C'est aussi la seule façon, sous READ COMMITTED, de faire tomber la contrainte : une
course honnête est sérialisée par le verrou avant d'y jamais arriver.

## Amendement — L'ordre des deux instructions est inversé (#487)

La décision prescrit « `SELECT … FROM "Category" FOR UPDATE`, en SQL brut, première instruction de la
transaction de chaque mutation de Structure », puis « `SET LOCAL lock_timeout` suit immédiatement le
verrou ». Cet ordre-là borne tout sauf la plus longue des attentes : celle du verrou grossier, qui
précède toutes les autres et se heurte à toute mutation déjà en cours. Le délai suit l'attente qu'il
devait couper, et l'attente retombait sur le délai de Prisma — 5 000 ms, puis une `P2028`, c'est-à-dire
une erreur de lecteur.

**Le délai s'arme désormais avant tout verrou**, et `verrouillerStructure` le pose en premier. Poser
un réglage ne prend aucun verrou : le premier verrou pris reste le verrou grossier, la sérialisation
reste entière, et cette attente comme toutes les autres tombe sous le même délai.

- **Deux phrases de la décision sont devenues fausses** : « première instruction de la transaction
  de chaque mutation de Structure » et « `SET LOCAL lock_timeout` suit immédiatement le verrou ».
  La première n'est plus exacte — le `set_config` passe avant, et le `FOR UPDATE` est la première
  instruction **qui verrouille** ; la seconde est inversée. Aucune ligne de la décision n'est
  changée ici, comme le veut la convention du fichier ; ce sont ces deux phrases qu'il faut lire
  ensemble avec le présent amendement.

- **Ce que l'inversion couvre, et qui n'était pas vrai de l'ordre qu'elle remplace.** La phrase
  « la forme que [`#488`](https://github.com/eloaurdi/eguidar/issues/488) et
  [`#489`](https://github.com/eloaurdi/eguidar/issues/489) devront employer » est fausse pour
  [`#488`](https://github.com/eloaurdi/eguidar/issues/488) : cette tranche est livrée, elle n'a pas
  employé la forme qu'elle fixe. Elle reste vraie pour
  [`#489`](https://github.com/eloaurdi/eguidar/issues/489), et `createCategory` prendra l'inversion
  en même temps que le verrou, qu'elle ne prend toujours pas. Le verrou grossier étant pris par un
  seul `verrouillerStructure`, l'inversion vaut déjà pour `updateCategory` : elle n'a pas été choisie
  par la tranche de suppression, elle s'est imposée à toutes les autres.

- **Ce que l'inversion ne referme pas.** Elle borne **toute attente de verrou** de la transaction,
  et plus rien d'autre. La marche d'acyclicité ne prend aucun verrou : le troisième piège nommé
  ci-dessus reste entier, et un cycle déjà présent fait toujours tourner la marche jusqu'au délai de
  Prisma. La garantie de sérialisation est totale ; l'attente qu'elle produit ne l'est pas.

### Ce que l'inversion prouve

Joué contre le même PostgreSQL : une Tierce partie tient le verrou grossier sans le rendre, et la
suppression part. L'épreuve attend le signal de la Tierce partie — le chronomètre ne commence pas
avant que le verrou soit réellement tenu.

| Ordre                 | Éprouvé par                                                      | Constat mesuré                                                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| délai après le verrou | aucune suite — observé sur l'ordre que cet amendement remplace   | au-delà du délai, la suppression **attend encore** ; elle ne s'arrête qu'au délai de Prisma |
| délai avant le verrou | [`admin-structure.test.ts`](../../lib/use-cases/admin-structure.test.ts) | refus à `55P03` au bout de **1 021 ms**, source intacte, aucun effet parti                  |

La première ligne n'est pas éprouvée par une suite, et il ne faut pas le dire autrement : le code
qui la produisait n'existe plus. Seule la seconde a un test, et c'est celle qui doit en avoir un :
elle éprouve seule un délai qui ne s'arme pas avant le verrou.

## Amendement — La troisième tranche : `createCategory` seule (#489)

Les trois tranches se livrent maintenant ensemble.
[#488](https://github.com/eloaurdi/eguidar/issues/488) avait posé la deuxième ; celle-ci pose la
troisième, et avec elle la réserve de l'amendement de la première tranche — « La décision est
prise, pas livrée » — cesse d'être exacte. Ce qui manquait à `createCategory`, une transaction, le
verrou grossier et la surface d'erreurs, y est.

- **Les quatre phrases que l'amendement de la première tranche disait fausses sont maintenant
  vraies.** « Elle vaut pour `createCategory`, `updateCategory` et `deleteCategory` », «
  `createCategory` et `updateCategory` gagnent une transaction », « toute issue d'une mutation de
  Structure est un `UserFacingError` », et la forme « première instruction **qui verrouille** » que
  l'amendement de l'inversion a rendue exacte. La garantie est désormais livrée dans son ensemble,
  et non plus dans sa première tierce. La troisième reste une phrase d'aspiration :
  `mapCourseDeStructure` traduit les courses qu'ADR-0027 nomme — dépassement de délai, interblocage,
  violation de clé étrangère — et laisse passer le reste, un délai de transaction Prisma expiré
  (`P2028`) par exemple, qui reste une erreur de lecteur. C'est ainsi depuis la première tranche ; la
  création ne l'a pas rendu plus absolu.

- **La création prend le verrou comme les deux autres, et avant toute lecture.** Le verrou est la
  première instruction qui verrouille, donc la lecture du slug et celle du parent viennent après lui
  et non avant — ce qu'exige l'amendement de l'inversion, et que la note de
  [#489](https://github.com/eloaurdi/eguidar/issues/489) lisait à l'envers en demandant
  d'« enchaîner le verrou juste après » le passage de `tx`. Le code suit la décision, pas la note.

- **La promesse des deux racines est bornée par le délai, pas absolue.** Une insertion de racine ne
  pose aucune référence de clé étrangère, donc rien à verrouiller d'elle-même : le verrou ne protège
  pas sa propre course — deux créations de racines concurrentes ne partagent aucun invariant et se
  committent toutes deux, c'est voulu — il tient la promesse. « Toutes deux » suppose la gagnante
  engage moins que le délai ; au-delà, la perdante reçoit le Refus de la Structure, comme toute
  mutation qui attend trop longtemps. L'exception est assumée et n'exonère personne du verrou.

- **`assertUniqueCategorySlug` lit sur le client de la transaction**, comme
  `assertCategoryParent` et `assertAcyclicCategoryTree` désormais. Les trois lectures et l'écriture
  partagent un seul engagement et une seule connexion. C'est un changement de signature interne
  dont [`updateCategory`](../../lib/use-cases/admin-structure.ts) bénéficie aussi : sa lecture du
  slug ne prenait plus une seconde connexion pendant que la première tenait le verrou.

- **Ce que cette tranche ne referme pas.** Les trois pièges nommés de la décision restent entiers :
  `Product_categoryId_fkey` échoue toujours du côté Catalogue, la marche d'acyclicité reste non
  bornée, et l'écart entre le schéma Prisma et la base sur `Category_parentId_fkey` demeure. La
  frontière aussi : Commande, Catalogue et Livraison gardent READ COMMITTED, et les effets de la
  Structure restent post-commit et best-effort (ADR-0014).

### La condition que la preuve du verrou grossier présupposait

`SELECT … FROM "Category" FOR UPDATE` prend des verrous de ligne : **sur une table vide, il ne
verrouille rien**. Une Tierce partie qui le tient dans une base dont la Structure est vide laisse
passer la création, et une épreuve de contention qui ne plante rien avant de le faire croit
mesurer une contention qui n'a pas eu lieu — c'est ce qu'a montré la première forme de l'épreuve
de cette tranche, qui a rendu son verdict en quelques centaines de millisecondes au lieu
d'attendre le délai. L'épreuve plante donc une Structure avant de faire tenir le verrou, et le
dit.

Ce n'est pas une exception à la décision, qui parle d'un arbre administré, et c'est l'« exception
assumée » ci-dessus qui le rend inoffensif : deux créations concurrentes sur une Structure vide ne
partagent aucun fait, et une fois la première ligne plantée, toute création concurrente se sérialise
comme les deux autres mutations. Ce que la tranche ajoute là est une limite de l'**épreuve**, pas
de la garantie.

### Ce que la preuve montre

Joué contre le même PostgreSQL, dans
[`admin-structure.test.ts`](../../lib/use-cases/admin-structure.test.ts) :

| Cas                                                                                                          | Constat mesuré                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Une Tierce partie tient le verrou grossier et ne le rend pas, une création de racine part                     | `CategoryBusyError` à **≈ 1 000 ms**, aucun slug écrit, aucun effet parti — la création ne s'exempte pas du délai |
| Une Tierce partie supprime la Structure d'accueil sous le verrou et retient son commit, la création part ensuite | **après** : la création attend le verrou, lit une Structure absente et rend `CategoryValidationError`, rien n'est écrit. **Avant**, la même épreuve rejouée contre le code antérieur à la tranche rendait une `PrismaClientKnownRequestError` sur `Category_parentId_fkey` : relevé en rejouant l'épreuve, **pas éprouvé par une suite** — le code qui le produisait n'existe plus |
| Deux créations concurrentes du même slug                                                                     | l'une commite, l'autre rend `CategorySlugConflictError`, un seul slug et un seul jeu d'effets — l'épreuve garde la surface du refus, elle ne mesure pas leur sérialisation |
| L'effet d'invalidation de la création                                                                         | il observe la Structure déjà engagée au moment où il s'exécute                                                    |

La deuxième ligne est, pour la création, ce que la première ligne du tableau de la décision est
pour la suppression : la seule où la garantie améliore une course au lieu de la traduire. Une Tierce
partie qui retire la Structure d'accueil sous le verrou ne fait plus sortir l'action serveur en
exception ; l'éditeur reçoit un refus qu'il sait traiter.

## Amendement — Le piège nommé sur `Product_categoryId_fkey` survit à la nullabilité (#522)

[#522](https://github.com/eloaurdi/eguidar/issues/522) a rendu `Product.categoryId` nullable et a
donné au Produit sans Structure un état défini —
[ADR-0029](0029-produit-sans-structure.md). Ce qu'elle touche ici est **le deuxième piège nommé**, et
l'hypothèse qui le rendait fragile était fausse.

**La contrainte ne s'affaiblit pas.** `Product_categoryId_fkey` est en `ON DELETE RESTRICT`
([`20260810111743_init/migration.sql:239`](../../prisma/migrations/20260810111743_init/migration.sql#L239)),
et `RESTRICT` ne considère que les lignes dont la clé étrangère est non nulle : une ligne dont
`categoryId` est `NULL` ne référence rien et n'est jamais comptée. Rendre la colonne nullable ne
change donc rien à ce que la contrainte refuse. **C'est ce qui rend la décision d'ADR-0029 possible :
si `RESTRICT` ne survivait pas, aucun code ne pourrait orpheliner un Produit sans écrire contre sa
propre base.**

**Ce qui change, c'est qui rencontre la contrainte.** `deleteCategory` efface désormais lui-même la
colonne — réaffectation ou orphelinat — avant son `tx.category.delete`, dans la même transaction et
sous le même verrou grossier. La contrainte ne refuse donc plus les Produits que la transaction
**voit** : elle les a déjà vidés. Elle refuse encore ceux qui arrivent après.

**Et c'est la mesure qui le dit, pas le raisonnement.** L'épreuve de la Tierce partie
(`session_replication_role = 'replica'`, un fantôme invisible à la lecture de la suppression) a été
rejouée avec `orphanProducts` : elle rend **toujours** `CategoryBusyError` sur
`Product_categoryId_fkey`, exactement comme avant. La suppression vide la colonne de ce qu'elle voit ;
le fantôme arrive après, et la contrainte le refuse encore. **L'orphelinat n'a pas désarmé
`RESTRICT`.** L'hypothèse contraire — « la colonne est déjà vide, donc plus rien ne peut la faire
échouer » — était fausse, et elle n'aurait survécu à aucune suite.

Ce qui change est donc plus étroit : **le refus devient un réessai, pas un blocage.** Au second essai
le fantôme est committé, donc visible ; la suppression le voit, le vide comme les autres, et aboutit.
C'est ce que l'éditeur fait, et c'est ce que le Refus de la Structure lui dit de faire.

**La course 1 du tableau a désormais deux issues.** « La tierce insère un Produit, puis la
suppression part » : la suppression attend le verrou, voit le Produit, et le réaffecte **ou** l'orpheline
selon ce que l'éditeur a choisi. La sérialisation garantit qu'ils ne s'entrelacent pas ; elle ne dit
plus lequel gagne, parce que les deux gagnent et que le départage est métier. Aucune ligne de la
décision n'est changée ici, et le verrou grossier, le délai armé avant lui, la translation des
courses et la frontière énoncée restent exactement ce qu'ils étaient.

**Aucun test n'est devenu faux, et c'est un fait mesuré, pas une espérance.** Les épreuves de
contention de [`admin-structure.test.ts`](../../lib/use-cases/admin-structure.test.ts) rendent
toutes exactement ce qu'elles rendaient. L'épreuve de la Tierce partie a été rejouée avec
`orphanProducts` et rend toujours `CategoryBusyError` sur `Product_categoryId_fkey` ; la preuve
neuve est **le réessai**, ajouté à côté d'elle et non à sa place : le second essai, le fantôme
étant alors visible, aboutit et orpheline les deux Produits. Les deux coexistent, et c'est leur
différence qui dit ce que l'orphelinat a changé — rien sur la course, tout sur la suite qu'on donne
à l'éditeur.

Les deux autres pièges nommés sont intacts : `Category_parentId_fkey` reste en `ON DELETE SET NULL` et
l'écart avec le schéma Prisma demeure, et la marche de `assertAcyclicCategoryTree` reste non bornée.

## Amendement — La marche d'acyclicité s'arrête sur un cycle déjà présent (#490)

Le troisième piège nommé est fermé. `assertAcyclicCategoryTree` garde désormais les identifiants
qu'elle a visités et s'arrête sur une revisite au lieu de remonter une chaîne sans fin. Ce n'est pas
une innovation : le même domaine en portait déjà la forme, et le dépôt le disait.

### Ce que cet amendement rend faux, et où le lire

Comme le veut la convention du fichier, aucune phrase de la décision n'est changée ici. Le piège
nommé est en revanche énoncé **quatre fois**, et les quatre passages décrivent désormais un état
fermé. C'est cet amendement qu'il faut y lire à côté :

- le **troisième piège nommé** lui-même, et sa phrase « un cycle déjà présent fait simplement tourner
  la marche jusqu'au délai de 5 000 ms » ;
- la rééirmation dans l'amendement de la réaffectation saisissable ;
- la rééirmation dans l'amendement de l'inversion des deux instructions — « La marche d'acyclicité ne
  prend aucun verrou : le troisième piège nommé ci-dessus reste entier » ;
- la rééirmation finale de l'amendement sur la nullabilité des Produits.

Sa citation de ligne est par ailleurs périmée : le passage qu'elle désigne est aujourd'hui aux lignes
329-361 du module.

Le renvoi lui-même — « **Suivi à part** » — reste exact : c'est ce suivi.

### L'écart que le dépôt décrivait lui-même

`components/admin/delete-category-button.tsx` parcourt la même chaîne d'ancêtres, garde `vus`, et
explique dans son commentaire que le serveur, lui, n'a pas de jeu de structures visitées — que le
verrou interdit d'en former un, et que ce manque est un piège nommé. **Cette phrase est devenue
fausse, et le commentaire avec elle.** La division qu'il énonçait — le serveur plus exposé que le
client sur ce seul point — n'a plus de raison d'être : les deux marches portent le même garde, et la
seule garantie commune qu'il mentionnait, le refus d'une cible cyclique, tient maintenant des deux
côtés. Le commentaire est mis à jour dans le même temps que le code.

### Un garde, deux diagnostics

Le jeu de structures visitées s'arrête sur **toute** revisite, et deux faits s'y cachent. La marche
peut revenir sur la Structure déplacée — l'éditeur veut la suspendre sous sa propre descendante, et le
refus actuel dit exactement cela. Elle peut aussi revenir sur un nœud quelconque : la chaîne
d'ancêtres que l'éditeur vise est **déjà cyclique**, et le déplacement qu'il propose n'y est pour rien.

Les deux sont des refus, mais pas de la même faute. Le second n'appartient pas à l'éditeur : le lui
rendre comme une saisie invalide lui apprend à réessayer, et réessayer ne répare pas une donnée
corrompue. Le jeu de structures visitées les distingue **et** répond à ce que l'ADR dit de la surface
d'erreurs : une épreuve doit pouvoir dire laquelle des deux routes elle éprouve.

Le refus neuf ne réutilise donc pas `CategoryValidationError`. Son préfixe — `« Données invalides : »`
— dirait la faute de l'éditeur dans les trois premiers mots d'un refus qui parle d'une corruption
importée, reprise de données ou correction manuelle. Un refus à part est aussi ce qu'exige la
décision elle-même : « Toute issue d'une mutation de Structure est un `UserFacingError`, jamais une
erreur de lecteur ». Le glossaire en tire la même exigence par une autre porte — « Une mutation de
Structure ne produit jamais d'autre issue » ([GLOSSARY.md](../../GLOSSARY.md)). La classe étend
`UserFacingError`, comme toute classe de refus de ce dépôt — **`Error` nu la ferait sortir de l'action
serveur en exception**, ce qui est précisément le symptôme que cet amendement ferme.

### Le plafond écarté, et pourquoi

Un plafond de profondeur aurait borné la marche en quelques lignes. Il a été écarté : il borne sans
détecter, et il introduirait une règle d'affaires neuve — quelle profondeur est légale pour une
Structure ? — à laquelle ni ce dépôt ni son glossaire ne répondent aujourd'hui. Détecter est plus
précis et ne demande rien de neuf. Les deux ne s'excluaient pas ; le second seul eût été une
dette nouvelle.

### Ce que cet amendement ne ferme pas

- **Le trou `P2028` reste ouvert.** Le garde supprime la source que l'épreuve ci-dessous mesure, pas
  le symptôme : une chaîne profonde et acyclique fait toujours autant d'allers-retours dans une
  transaction de 5 000 ms. `P2028` reste donc atteignable, et `mapCourseDeStructure` ne le traduit
  toujours pas — il reste une erreur de lecteur. C'est un chantier à part, comme le disait déjà
  l'amendement de la troisième tranche.
- **La marche de `storefront.ts` n'est pas touchée.** `getCategoryChain` remonte la même chaîne sur
  une `Map` en mémoire, sans garde non plus : un cycle y fait une boucle sans transaction à expire.
  Même condition de données, autre surface — un rendu serveur, pas une mutation. Suivi à part.

### Ce que l'épreuve montre

Joué contre le même PostgreSQL, dans
[`admin-structure.test.ts`](../../lib/use-cases/admin-structure.test.ts) : une Tierce partie écrit
un `parentId` **directement en base** — un état corrompu importé, hors de toute mutation de Structure,
puis une mutation vise un membre de ce cycle.

| Cas                                                     | Avant                                                    | Après                                                       |
| ------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Cycle déjà en base, mutation qui vise un de ses membres | **`P2028` à 5 010 ms** — erreur de lecteur, non rattrapée | refus nommé, immédiat, transaction rétractée               |

La mesure qui importe est le **type** de l'erreur d'hier, non sa lenteur : `mapCourseDeStructure`
traduit `55P03`, `40P01`, `23001`/`23503`, `P2003` et `P2034`, laisse passer le reste, et
`executeMutationAction` relance tout ce qui n'est pas un `UserFacingError`. La marche ne rendait donc
pas seulement un refus absent — elle sortait de l'action serveur en exception, ce qu'ADR-0027 s'était
donné pour but d'empêcher. L'amendement de la troisième tranche nommait `P2028` comme résidu
assumé ; il reste un résidu, mais la marche n'est plus un moyen de l'atteindre à volonté.

## Amendement — Les deux marches de la boutique portent le même garde (#540)

Le suivi à part que l'amendement de #490 a laissé ouvert est tenu. `getCategoryChain` garde les
identifiants qu'elle a visités, et toute revisite l'arrête — comme
`assertAcyclicCategoryTree`, comme la boîte de suppression côté client. Les trois marches du dépôt
portent désormais le même garde.

### Ce que cet amendement rend faux, et où le lire

La phrase de l'amendement de #490 — « La marche de `storefront.ts` n'est pas touchée […] Suivi à
part » — reste exacte : l'amendement ne la change pas, et c'est celui-ci qu'il faut y lire à côté.

### La seconde marche, que le ticket n'avait pas vue

`collectCategoryAndDescendantIds` ([`storefront.ts:199-228`](../../lib/use-cases/storefront.ts#L199-L228))
descend la même chaîne, file plutôt que curseur, et **était bornée par le même cycle**. Elle
n'était nommée nulle part : le ticket #540 ne la décrit pas, et le suivi à part qu'ADR-0027
laissait ouvert ne la visait pas non plus. Elle est du même défaut que celui que #490 fermait —
une `Map` en mémoire, une boucle `while`, aucune garde — et la fermer avec lui était la seule
façon de ne pas laisser dans le même fichier deux marches du même domaine dont une seule est
bornée.

### Un garde, deux postures

Le garde est identique ; ce qu'on en fait ne l'est pas, et c'est la surface qui décide.

- **La mutation refuse**, en son propre nom (`CategoryAncestorCycleError`) : quelqu'un a proposé
  quelque chose, et lui rendre « Données invalides » lui apprendrait à réessayer un déplacement
  que réessayer ne répare pas.
- **La lecture dégrade**, en rendu : la chaîne s'arrête où elle se referme, la page se rend. Un
  visiteur n'a aucune faute à commettre, et une donnée corrompue qui lui rend une page cassée
  serait pire qu'une donnée corrompue qu'il ne voit pas.

La posture est celle que cette lecture tient déjà pour une colonne JSON abimée : des faits
dégradés, jamais une page cassée. Ce n'est pas une règle neuve, c'est le même contrat que
`urlsImagesProduit` et `specificationsProduit` appliquent à deux colonnes voisines.

### Le plafond écarté, et pourquoi — cette fois pour de bon

L'amendement de #490 écartait le plafond au nom d'une règle d'affaires neuve : quelle profondeur
est légale pour une Structure ? L'objection ne tombe pas ici, elle s'aggrave. Un plafond borne
sans détecter, donc il tronque **aussi** une chaîne profonde et parfaitement saine — et il ne
saura jamais distinguer les deux cas. Le jeu de structures visitées, lui, ne laisse passer
qu'une chaîne réellement cyclique : une Structure à trente niveaux de profondeur remonte entière,
comme avant. **La memoirisation suffit à borner la marche, sans qu'aucune règle nouvelle n'entre
dans le dépôt** — ce que l'amendement de #490 disait déjà, et que ce second usage confirme de la
même manière.

### Ce que cet amendement ne ferme pas

- **Le trou `P2028` reste ouvert**, inchangé : il ne concerne que la transaction de la mutation.
- **`buildCategoryTree` n'a pas besoin de garde, et c'est mesuré.** Sur un cycle, les nœuds
  concernés ne sont pas des racines — leur parente existe — donc ils ne sont pas atteignables
  depuis `roots`, et `accumulateProductCounts` ne les voit jamais. La marche de l'accueil
  s'arrête donc d'elle-même ; elle perd les Structures cycliques, elle ne boucle pas.

### Ce que l'épreuve montre

Joué contre le même PostgreSQL, dans
[`storefront.test.ts`](../../lib/use-cases/storefront.test.ts) : une Tierce partie écrit un
`parentId` **directement en base**, puis la boutique lit une fiche Produit et une page de
catégorie qui sont toutes deux dans le cycle.

| Cas                                   | Avant                                             | Après                                       |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| Fiche Produit d'une Structure cyclique | **ne rend jamais** — la marche occupe le process   | la fiche se rend, fil d'Ariane borné        |
| Page de catégorie d'une Structure cyclique | **ne rend jamais** — la file grossit à chaque tour | la page se rend, descendantes énumérées une fois |

La mesure qui importe est l'absence de sortie, non sa lenteur. L'amendement de #490 avait un
délai de 5 000 ms pour borner le symptôme et en faire une erreur mesurable ; ici **rien n'`expire**
: la marche est synchrone, sur une `Map` déjà chargée, sans transaction, sans timeout, sans
`await` qui rende la main. Le rendu serveur ne s'arrête pas et le `chain` croît à chaque tour —
la seule borne est la mémoire du process. L'épreuve rouge est donc un test qui ne termine pas,
et non une assertion qui échoue.

## Amendement — `P2028` devient un Refus de la Structure, et la chaîne se lit en une requête (#541)

Le résidu que l'amendement de la troisième tranche nommait est fermé. La décision était prise depuis
le début — « Toute issue d'une mutation de Structure est un `UserFacingError`, jamais une erreur de
lecteur » — et il manquait la traduction, ainsi que la cause qui rendait `P2028` atteignable sur des
données saines.

### Ce que cet amendement rend faux, et où le lire

Trois passages décrivent l'état fermé ici. Aucune ligne de la décision n'est changée, comme le veut
la convention du fichier ; c'est le présent amendement qu'il faut y lire à côté :

- l'amendement de la troisième tranche — « laisse passer le reste, un délai de transaction Prisma
  expiré (`P2028`) par exemple, qui reste une erreur de lecteur » ;
- l'amendement de #490 — « **Le trou `P2028` reste ouvert.** […] `mapCourseDeStructure` ne le
  traduit toujours pas — il reste une erreur de lecteur » ;
- l'amendement de #540 — « **Le trou `P2028` reste ouvert**, inchangé : il ne concerne que la
  transaction de la mutation. »

Le troisième piège nommé — la marche non bornée — est déjà fermé par l'amendement de #490 ; ce n'est
pas ce que celui-ci reprend.

### La traduction, et pourquoi un refus neuf

`mapCourseDeStructure` gagne une quatrième route : `P2028` devient
`CategoryTransactionExpiredError`, « Refus de la Structure : la transaction a dépassé son délai ».

Ici, le code Prisma est la seule voix à consulter, et c'est la règle que l'amendement de la première
tranche a posée — « Le SQLSTATE décide ; le code Prisma ne départage que ce qu'il sait seul ».
`P2028` n'a **aucun** SQLSTATE à lire : ce n'est pas PostgreSQL qui le lève mais Prisma, et l'erreur
ne porte ni `driverAdapterError` ni `originalCode`. Relevé contre le PostgreSQL du dépôt, sur les
deux formes que ce code recouvre : la transaction interactive devenue trop longue en cours de route,
et celle qui n'a pas obtenu de connexion dans le délai d'attente de Prisma. Les deux portent `P2028`.

**Le refus ne réutilise pas `CategoryBusyError`**, et ce n'est pas une préférence de style. La
contention et un délai dépassé ne demandent pas la même chose à l'éditeur : `CategoryBusyError` dit
« réessayez » parce que réessayer répare une Structure tenue par une autre mutation. Ici, rien ne le
promet. Le refus dit donc le fait — la transaction a dépassé son délai — sans prescrire un remède qui
peut être faux, comme `CategoryAncestorCycleError` dit la corruption sans dire « Données invalides ».
C'est aussi ce qui permet à une épreuve de dire laquelle des deux routes elle éprouve.

### La chaîne d'ancêtres se lit en une requête

`assertAcyclicCategoryTree` faisait un `findUnique` par maillon. Une chaîne profonde et acyclique
coûtait donc autant d'allers-retours séquentiels dans une transaction interactive de 5 000 ms, et
c'est cette dépendance — non la corruption — qui rendait `P2028` atteignable.

Elle lit désormais la chaîne entière en **une** requête récursive (`WITH RECURSIVE … UNION …`), qui
rend la table des liens `id → parentId`. La marche garde son curseur, son ordre et ses trois refus ;
seule sa source change, et c'est pourquoi le refus nommé d'un cycle reste le sien (ADR-0030).
`UNION` et non `UNION ALL` : la forme récursive écarte les lignes déjà produites, donc un cycle
arrête la récursion au lieu de la faire tourner — c'est la seule borne de la requête, aucune
profondeur maximale n'étant une règle de ce dépôt.

**Aucune profondeur maximale n'entre dans le dépôt**, et c'est le point : la requête ne borne pas la
longueur, elle cesse d'en payer le prix en allers-retours. Une chaîne de vingt-quatre niveaux — la
plus profonde que l'épreuve plante — remonte entière, comme avant.

### Ce que cet amendement ne ferme pas

- **Le délai de la transaction reste celui de Prisma.** La troisième voie que #541 nommait — « un
  délai propre à la transaction de Structure » — n'est pas prise ici : rien ne change les 5 000 ms
  héritées. Une base qui ne rend pas la main à temps rend toujours `P2028` ; elle rend maintenant un
  refus.
- **Les deux autres pièges nommés sont intacts** : `Product_categoryId_fkey` échoue toujours du côté
  Catalogue, et l'écart entre le schéma Prisma et la base sur `Category_parentId_fkey` demeure.
- **La frontière est inchangée** : Commande, Catalogue et Livraison gardent READ COMMITTED et leurs
  courses, et les effets de la Structure restent post-commit et best-effort (ADR-0014).

### Ce que l'épreuve montre

Joué contre le même PostgreSQL, dans
[`admin-structure.test.ts`](../../lib/use-cases/admin-structure.test.ts) :

| Cas                                                                                      | Constat mesuré                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le pool de connexions est saturé, une création part                                      | refus en **≈ 2 000 ms** — le délai d'attente de Prisma, pas celui de la transaction, qui en compte 5 000 — source non écrite, aucun effet parti   |
| Une chaîne de 4 maillons, puis une de 24, sous un compteur de lectures de la transaction  | **2 lectures** dans les deux cas. Avant : **6**, puis **26** — un `findUnique` par maillon                                                        |

La seconde ligne est la mesure qui compte, et elle lit un compteur de lectures, non une horloge :
les deux formes rendent le même résultat, et sur une base locale un `findUnique` de plus ne se voit
ni à l'issue ni au temps. La couture est le client de la transaction lui-même —
`tx.category.findUnique` est une propriété propre et remplaçable, `$transaction` aussi — donc
l'épreuve lit un vrai PostgreSQL et ne double que le comptage.

La première ligne éprouve la seconde forme de `P2028` et non la première : une transaction
interactive devenue trop longue n'est atteignable qu'en la rendant réellement lente, et aucune
contention ne le peut — le `lock_timeout` de 1 000 ms borne toutes les attentes de verrou. Le pool,
lui, se sature sans rien simuler. **La mesure qui importe est le code**, que les deux formes
partagent, et c'est lui que la traduction lit.

## Amendement — La Lecture de la Structure ne lit jamais sous le verrou grossier (#564)

Le verrou grossier a une portée : les mutations de Structure, et rien d'autre. Un module qui possède la
lecture de la Structure apparaît, et ce qu'il ne fait pas est écrit ici plutôt que dans son seul
en-tête. Aucune ligne de la décision n'est changée ; trois passages sont la place où lire cette limite
à côté :

- la troisième puce de la décision — `assertAcyclicCategoryTree` « lisait la chaîne des parents sur le
  client `prisma` nu : elle ne pouvait pas voir l'état non committé d'une transaction. Le verrou n'a de
  sens que dans une transaction ». L'argument vaut pour toute lecture qu'une mutation **juge**, jamais
  pour une lecture qui rend une page ;
- l'invariant « **Aucun nouveau module, aucune couche de réessai.** Le verrou et la traduction vivent
  dans `lib/use-cases/admin-structure.ts` » : un module neuf apparaît, et il ne prend ni verrou, ni SQL,
  ni traduction. L'invariant reste vrai pour ce qu'il visait — le verrou et la traduction ne quittent
  pas leur module — et ne l'est plus quant à ses mots ;
- la première phrase de l'amendement de #490, « `assertAcyclicCategoryTree` lisait la chaîne des
  parents sur le client `prisma` nu », dont le module neuf ne fournit aucun analogue.

### La limite

- **La Lecture de la Structure ne lit jamais dans une transaction.**
  [`lib/use-cases/lecture-structure.ts`](../../lib/use-cases/lecture-structure.ts) lit la table
  `Category` une fois par exécution, hors de tout `$transaction`, sans prendre `FOR UPDATE` et sans
  armer `lock_timeout`. **Aucune mutation ne peut être servie par elle**, et la règle vaut dans les
  deux sens : le module ne rend jamais un fait qu'une mutation ait à juger.

- **Les lectures transactionnelles ne bougent pas.** Le verrou grossier, le contrôle d'unicité du
  slug, le contrôle de la Structure parente, la chaîne d'ancêtres, les lectures de rangée de
  `createCategory`, `updateCategory` et `deleteCategory`, et la lecture des Produits déplacés restent
  dans [`admin-structure.ts`](../../lib/use-cases/admin-structure.ts), sous le verrou. Elles
  raisonnent sur des faits engagés : c'est pour cela qu'elles lisent par le client de la transaction et
  jamais par le `prisma` nu.

- **La raison tient en une phrase.** Le verrou existe pour que les refus d'une mutation juge des faits
  qu'elle s'est engagés à voir ; une lecture faite hors transaction rend un fait committé, que le
  verrou garantit déjà — elle n'aurait rien à y gagner et une course à y perdre.

- **Les deux lectures qui restent hors du module ne sont pas transactionnelles non plus** : les noms
  de Structure d'une facette, lus par slug pour une Recherche, et le compte de Structures du tableau
  de bord. Aucune n'est une marche, et le module les nomme comme exceptions dans son en-tête plutôt
  que de les cacher.

### Ce que cet amendement ne change pas

- **La décision entière** : le verrou, son instruction en tête de transaction, le délai qui l'arme, la
  surface d'erreurs des refus et la frontière — Commande, Catalogue et Livraison gardent READ COMMITTED
  (ADR-0014).
- **La propriété du verrou**, qui reste `lib/use-cases/admin-structure.ts`. ADR-0025 n'est toujours pas
  amendé, et le module neuf n'apprend ni table, ni verrou, ni SQL.
- **Le refus d'un cycle déjà présent**, qui reste lié à sa transaction : la Lecture dégrade, elle ne
  refuse pas (ADR-0030).

### Où la limite est écrite, à part d'ici

Deux endroits la portent à côté de cet amendement : l'**en-tête du module**, qui déclare qu'il ne lit
pas sous le verrou, et un **seuil** qui énonce qu'aucune lecture de la Structure n'existe hors de lui,
les deux exceptions nommées comprises. Un seuil et non une garde de neutralité : la question n'est pas
ce que le module atteint, c'est qui lit la table.

## Amendement — Le module ne refuse que ce qu'il sait nommer (#616)

La surface d'erreurs décidée ici est totale **pour les défauts que le module sait nommer**, et ne
l'est pas au-delà. Toute issue d'une mutation de Structure n'est donc pas un `UserFacingError` :
un défaut que ni l'échelle d'unicité ni l'échelle de course ne reconnaît sort de la couture **tel
quel**, et le module ne compose pour lui aucun Refus de la Structure. C'est la même partition
qu'ADR-0004 tient pour une rangée illisible — un défaut sans traduction n'a pas de refus à dire, et
lui en inventer un reviendrait à nommer un cas que rien ne peut produire.

Le glossaire le dit désormais dans ces termes, et c'est sa phrase qu'il faut lire à côté :

> Une mutation de Structure ne produit jamais d'autre **refus** : tout défaut qu'elle sait nommer
> devient un Refus de la Structure, et un défaut qu'elle ne sait pas nommer est rendu tel quel,
> sans refus composé — la même partition qu'ADR-0004 tient pour une rangée illisible.
> ([GLOSSARY.md](../../GLOSSARY.md), entrée **Refus de la Structure**)

### Ce que la décision disait, et où lire cette limite à côté

Aucune ligne de la décision n'est changée, comme le veut la convention du fichier ; c'est le
présent amendement qu'il faut y lire à côté, en ces endroits :

- la cinquième puce de la décision — « **La surface d'erreurs est totale du côté Structure.** Toute
  issue d'une mutation de Structure est un `UserFacingError`, jamais une erreur de lecteur ». Le
  mot « totale » y est le même mot que dans la promesse du glossaire, et c'est lui qui demande à
  être lu ainsi : totale **pour ce que le module sait nommer** ;
- la formulation que l'amendement de la troisième tranche donnait de cette même propriété — « toute
  issue d'une mutation de Structure est un `UserFacingError` », rangée parmi les quatre phrases
  qu'il rendait vraies. Elle reste vraie des défauts nommés, et elle était déjà la lecture qu'il
  fallait faire ;
- l'amendement de #490, qui tire l'exigence du glossaire — « Une mutation de Structure ne produit
  jamais d'autre issue » ([GLOSSARY.md](../../GLOSSARY.md)) — et en fait « Toute issue d'une
  mutation de Structure est un `UserFacingError` ». Sa citation est la seule des trois qui soit
  périmée : le glossaire a retreint sa promesse, et c'est la version retreinte qu'il faut lui lire.

Le reste de la décision ne bouge pas : le verrou reste grossier, son délai reste armé avant lui,
`P2028` reste le refus que l'amendement de #541 en a fait, et les trois pièges nommés restent
entiers.

### Où vit l'échelle, et ce qu'elle n'a pas introduit

Les deux échelles de défauts tiennent désormais en **un seul passage privé** du module qui possède
déjà le verrou : `sousVerrouDeStructure`, dans
[`admin-structure.ts`](../../lib/use-cases/admin-structure.ts). Il ouvre la transaction, arme le
verrou par `verrouillerStructure`, rend la valeur du corps, et porte les deux échelles dans cet
ordre — l'unicité d'abord (`P2002` sur `slug` → `CategorySlugConflictError`, tout autre défaut
relancé tel quel), la course ensuite, qui laisse d'abord passer tout `UserFacingError` pour qu'un
refus du corps ne soit jamais réétiqueté par la mécanique. Les trois portes n'ont plus de
`try`/`catch` : chacune est sa règle et rien d'autre.

**Aucun module neuf, aucune couche de réessai.** L'invariant tient tel qu'il est écrit : la couture
est une fonction privée du module qui possède le verrou, elle n'ajoute aucun symbole exporté et
aucune importation, et rien ne réessaie — ni `SERIALIZABLE`, ni backoff, ni boucle. C'est là que la
retreinte se décide, et c'est aussi ce qui la borne : une seule liste de défauts à connaître pour
maintenir la garantie, à l'endroit unique où une quatrième porte ira la chercher.

Ce que la couture n'a pas fait, et qu'il faut dire parce que le dossier le laisse croire autrement :
rien de ce qui est au-dessus d'elle. Les options de transaction restent celles de Prisma, les
effets post-commit restent dans les portes et best-effort (ADR-0014, ADR-0025), la frontière reste
la Structure.

### Le trou nommé : l'échappement est consigné, non prouvé

La décision qu'un défaut non nommé s'échappe tel quel est écrite ici et dans le glossaire, et
**aucune épreuve ne la prouve**. Ce n'est pas un oubli de rédaction, c'est un manque à nommer :

- **Aucun défaut ne s'obtient à peu de frais.** Tout ce que la course rend dans cette base porte
  déjà un nom : `55P03`, `40P01`, `23001`/`23503`, `P2003`, `P2034`, `P2028`, `P2002` sur `slug`. La
  liste est close de ce côté — et `40P01` n'a pas d'épreuve, comme le dit déjà l'amendement de la
  première tranche, ce qui ne change rien ici : l'échelle le nomme, donc un Client ne le verrait pas
  tel quel. Pour éprouver l'échappement, il faudrait donc produire un défaut que le module ne nomme
  pas, c'est-à-dire en injecter un ;
- **Cette injection est hors du contrat de ce dépôt** : le premier double de client de transaction
  y serait un fait neuf, dans un dépôt qui n'a qu'un seul adaptateur de base et qui prouve contre un
  PostgreSQL réel. Les courses déjà éprouvées sont d'ailleurs la preuve que les codes qu'elles
  rendent sont bien ceux de cette base et de ce Prisma ;
- **La seule assertion de relancement du dépôt est ailleurs** : elle porte sur `createProduct`, une
  mutation du Catalogue, qui ne traverse jamais cette échelle. Elle ne prouve rien ici.

L'échappement est donc **consigné et non prouvé**, et il le reste tant qu'une suite ne le prouve
pas — le même traitement que les autres trous nommés de ce fichier. Ce qui est éprouvé, en
revanche, ne bouge pas : la suite de Structure existante continue de rendre les huit refus avec la
même voix et le même message, et c'est elle qui permet de dire que la retreinte n'a rien coûté à un
éditeur.
